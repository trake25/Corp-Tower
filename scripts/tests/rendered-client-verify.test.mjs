import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  exactWindowForPid,
  parsePidWindowRows,
  runRenderedVerification,
  windowCaptureArgs,
} from '../rendered-client-verify.mjs';

const ROOT = resolve('.');
const ROWS = [
  '0x001  0  111  0  0  1920  1080 host unrelated-window',
  '0x002  0  222  14  28  640  480 host task-window',
].join('\n');

test('rendered verification resolves only an exact PID window', () => {
  assert.deepEqual(parsePidWindowRows(ROWS, 222), [{ id: '0x002', pid: 222, x: 14, y: 28, width: 640, height: 480 }]);
  assert.equal(exactWindowForPid(ROWS, 111).id, '0x001');
  assert.equal(exactWindowForPid(`${ROWS}\n0x003  0  222  1  1  4  4 host duplicate`, 222), null);
  assert.equal(exactWindowForPid('0x002 0 222 14 28 0 480 host invalid', 222), null);
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
      queryWindows: () => ROWS,
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

test('rendered verification fails closed for ambiguous task windows without capture', async () => {
  let captured = false;
  const result = await runRenderedVerification({
    root: ROOT,
    authorized: true,
    timeoutMs: 100,
    env: { DISPLAY: ':runtime' },
    dependencies: {
      displayReady: () => true,
      makeTempDirectory: () => '/tmp/corp-tower-rendered-task-owned',
      godot: '/repo/Godot_v-test_linux.x86_64',
      spawn: () => ({ pid: 222, kill: () => {} }),
      queryWindows: () => `${ROWS}\n0x003 0 222 1 1 4 4 host duplicate`,
      sleep: () => Promise.resolve(),
      capture: () => {
        captured = true;
        return { status: 0 };
      },
    },
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'no unambiguous task-owned window');
  assert.equal(captured, false);
});

test('rendered verification contains no machine-specific credentials or broad cleanup', () => {
  const source = readFileSync(join(ROOT, 'scripts/rendered-client-verify.mjs'), 'utf8');

  assert.doesNotMatch(source, /\/home\/[^/]+\/\.Xauthority/);
  assert.doesNotMatch(source, /\b(?:pkill|killall|xhost)\b/);
  assert.match(source, /child\.kill\('SIGTERM'\)/);
});
