import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  displayContextFor,
  exactWindowForPid,
  parsePidWindowRows,
  queryWindows,
  runRenderedVerification,
  windowQueryCommand,
  windowCaptureArgs,
} from '../rendered-client-verify.mjs';

const ROOT = resolve('.');
const UNRELATED_ROW = '0x001  0  111  0  0  1920  1080 host unrelated-window';
const TASK_ROW = '0x002  0  222  14  28  640  480 host task-window';
const DUPLICATE_TASK_ROW = '0x003  0  222  1  1  4  4 host duplicate';

test('rendered verification resolves only an exact PID window', () => {
  assert.deepEqual(parsePidWindowRows(TASK_ROW, 222), [{ id: '0x002', pid: 222, x: 14, y: 28, width: 640, height: 480 }]);
  assert.deepEqual(parsePidWindowRows(UNRELATED_ROW, 222), []);
  assert.equal(exactWindowForPid(TASK_ROW, 222).id, '0x002');
  assert.equal(exactWindowForPid(`${TASK_ROW}\n${DUPLICATE_TASK_ROW}`, 222), null);
  assert.equal(exactWindowForPid('0x002 0 222 14 28 0 480 host invalid', 222), null);
});

test('rendered verification filters window rows inside the child query process', () => {
  const command = windowQueryCommand(222);
  assert.deepEqual(command.args.slice(0, 2), ['-v', 'pid=222']);
  assert.equal(command.command, 'awk');
  assert.match(command.args[2], /wmctrl -l -p -G 2>\/dev\/null/);
  assert.match(command.args[2], /fields\[3\] == pid/);

  let invocation = null;
  const output = queryWindows({ DISPLAY: ':runtime' }, 222, (program, args, options) => {
    invocation = { program, args, options };
    return { status: 0, stdout: TASK_ROW };
  });

  assert.equal(output, TASK_ROW);
  assert.equal(output.includes('unrelated-window'), false);
  assert.deepEqual(invocation, {
    program: 'awk',
    args: command.args,
    options: { env: { DISPLAY: ':runtime' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  });
  assert.equal(queryWindows({}, 0), '');
});

test('rendered verification accepts only inherited display context and fails closed without it', async () => {
  assert.deepEqual(displayContextFor({ DISPLAY: ':runtime', XAUTHORITY: '/runtime/auth' }), {
    display: ':runtime',
    inherited_xauthority: true,
  });
  assert.equal(displayContextFor({ XAUTHORITY: '/runtime/auth' }), null);

  const result = await runRenderedVerification({ authorized: true, env: {} });
  assert.equal(result.status, 'failed');
  assert.match(result.reason, /host display authorization is required/);
});

test('rendered verification uses window bounds and never a desktop fallback', () => {
  const args = windowCaptureArgs({
    display: ':runtime',
    window: { x: 14, y: 28, width: 640, height: 480 },
    output: '/tmp/corp-tower-rendered-test/window.png',
  });

  assert.deepEqual(args.slice(0, 7), ['-y', '-f', 'x11grab', '-video_size', '640x480', '-i', ':runtime+14,28']);
  assert.equal(args.includes('1920x1080'), false);
});

test('rendered verification captures and terminates only its retained task PID', async () => {
  const calls = { killed: [], capture: null, spawned: null };
  const result = await runRenderedVerification({
    root: ROOT,
    authorized: true,
    env: { DISPLAY: ':runtime' },
    dependencies: {
      displayReady: () => true,
      makeTempDirectory: () => '/tmp/corp-tower-rendered-task-owned',
      godot: '/repo/Godot_v-test_linux.x86_64',
      spawn: (command, args) => {
        calls.spawned = { command, args };
        return { pid: 222, kill: signal => calls.killed.push(signal) };
      },
      queryWindows: () => TASK_ROW,
      capture: (_command, args) => {
        calls.capture = args;
        return { status: 0 };
      },
    },
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.capture, '/tmp/corp-tower-rendered-task-owned/window.png');
  assert.equal(calls.spawned.args.includes('--path'), true);
  assert.deepEqual(calls.killed, ['SIGTERM']);
  assert.equal(calls.capture.includes(':runtime+14,28'), true);
});

test('rendered verification fails closed for zero or ambiguous task windows without capture', async () => {
  let captured = false;
  const zero = await runRenderedVerification({
    root: ROOT,
    authorized: true,
    timeoutMs: 100,
    env: { DISPLAY: ':runtime' },
    dependencies: {
      displayReady: () => true,
      makeTempDirectory: () => '/tmp/corp-tower-rendered-task-owned',
      godot: '/repo/Godot_v-test_linux.x86_64',
      spawn: () => ({ pid: 222, kill: () => {} }),
      queryWindows: () => '',
      sleep: () => Promise.resolve(),
      capture: () => {
        captured = true;
        return { status: 0 };
      },
    },
  });
  const ambiguous = await runRenderedVerification({
    root: ROOT,
    authorized: true,
    timeoutMs: 100,
    env: { DISPLAY: ':runtime' },
    dependencies: {
      displayReady: () => true,
      makeTempDirectory: () => '/tmp/corp-tower-rendered-task-owned',
      godot: '/repo/Godot_v-test_linux.x86_64',
      spawn: () => ({ pid: 222, kill: () => {} }),
      queryWindows: () => `${TASK_ROW}\n${DUPLICATE_TASK_ROW}`,
      sleep: () => Promise.resolve(),
      capture: () => {
        captured = true;
        return { status: 0 };
      },
    },
  });

  assert.equal(zero.status, 'failed');
  assert.equal(zero.reason, 'no unambiguous task-owned window');
  assert.equal(ambiguous.status, 'failed');
  assert.equal(ambiguous.reason, 'no unambiguous task-owned window');
  assert.equal(captured, false);
});

test('rendered verification contains no machine-specific credentials or broad cleanup', () => {
  const source = readFileSync(join(ROOT, 'scripts/rendered-client-verify.mjs'), 'utf8');

  assert.doesNotMatch(source, /\/home\/[^/]+\/\.Xauthority/);
  assert.doesNotMatch(source, /\b(?:pkill|killall|xhost)\b/);
  assert.doesNotMatch(source, /filterPidWindowRows/);
  assert.match(source, /child\.kill\('SIGTERM'\)/);
});
