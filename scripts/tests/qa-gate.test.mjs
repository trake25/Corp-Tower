import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { AUTOMATION_PROTOCOL_TESTS, classifyQaFailure, selectToolingQa } from '../qa-gate.mjs';

const QA_GATE = resolve('scripts/qa-gate.mjs');

function toolingFixture(source) {
  const root = mkdtempSync(join(tmpdir(), 'corp-qa-gate-test-'));
  const testPath = join(root, 'scripts/tests/context-query.test.mjs');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  mkdirSync(dirname(testPath), { recursive: true });
  writeFileSync(testPath, source);
  const result = spawnSync(process.execPath, [QA_GATE, '--changed', 'scripts/tests/context-query.test.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env,
  });
  return { result, root };
}

test('QA classifies executable and host failures as tooling-environment', () => {
  assert.equal(classifyQaFailure({
    message: 'client smoke: spawn Godot ENOENT',
    error: Object.assign(new Error('spawn Godot ENOENT'), { code: 'ENOENT' }),
  }), 'tooling-environment');
  assert.equal(classifyQaFailure({ message: 'missing root Godot binary matching Godot_v*_linux.x86_64' }), 'tooling-environment');
});

test('QA keeps syntax and compile failures task-owned', () => {
  assert.equal(classifyQaFailure({ output: 'SyntaxError: Unexpected token }' }), 'implementation');
  assert.equal(classifyQaFailure({ output: 'Parse Error: Could not parse script.' }), 'implementation');
});

test('ordinary assertion failures remain task-owned by default', () => {
  const output = 'not ok 1 - scores remain stable\nAssertionError [ERR_ASSERTION]: expected 2 to equal 3';

  assert.equal(classifyQaFailure({ output }), 'implementation');
  assert.equal(classifyQaFailure({
    output,
    requestedClassification: 'test-expectation',
    evidence: 'Source and history prove the asserted value predates this task.',
  }), 'test-expectation');
});

test('automation sources select focused tests from the canonical protocol', () => {
  const tooling = selectToolingQa(['scripts/qa-gate.mjs', 'scripts/agent-observability.mjs']);

  assert.equal(tooling.applies, true);
  assert.deepEqual(tooling.tests, [
    'scripts/tests/agent-observability.test.mjs',
    'scripts/tests/context-query.test.mjs',
    'scripts/tests/qa-gate.test.mjs',
    'scripts/tests/task-close.test.mjs',
  ]);
  assert.ok(tooling.tests.length < AUTOMATION_PROTOCOL_TESTS.length);
  assert.ok(tooling.tests.every(path => AUTOMATION_PROTOCOL_TESTS.includes(path)));
});

test('public receipt helpers select their focused automation contracts', () => {
  assert.deepEqual(selectToolingQa(['scripts/lib/task-identity.mjs']).tests, [
    'scripts/tests/git-sync-commit-push.test.mjs',
    'scripts/tests/task-close.test.mjs',
  ]);
  assert.deepEqual(selectToolingQa(['scripts/lib/qa-receipt.mjs']).tests, [
    'scripts/tests/task-close.test.mjs',
  ]);
});

test('both sides of the tutorial defaults contract select the parity test', () => {
  const parity = 'scripts/tests/tutorial-defaults-parity.test.mjs';

  assert.ok(selectToolingQa(['src/Server/app/Game_Config.js']).tests.includes(parity));
  assert.ok(selectToolingQa([
    'src/Client/App/corp-tower/Cor/Scripts/GameUi/Tutorial/TutorialLessons.gd',
  ]).tests.includes(parity));
  assert.deepEqual(selectToolingQa(['scripts/lib/tutorial-defaults-parity.mjs']).tests, [parity]);
});

test('unrelated product paths do not select tutorial defaults parity', () => {
  const parity = 'scripts/tests/tutorial-defaults-parity.test.mjs';
  const tooling = selectToolingQa([
    'src/Server/app/engine/Scoring.js',
    'src/Client/App/corp-tower/Cor/Scripts/GameUi/InventoryController.gd',
  ]);

  assert.equal(tooling.tests.includes(parity), false);
});

test('focused tooling success suppresses child TAP', () => {
  const { result, root } = toolingFixture(`
    import test from 'node:test';
    test('verbose child success sentinel', () => {});
  `);

  try {
    assert.equal(result.status, 0, JSON.stringify({ signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr }));
    assert.equal(result.stdout.trim(), 'PASS — tooling targeted tests (1)');
    assert.doesNotMatch(result.stdout, /TAP version|Subtest|verbose child success sentinel/);
    assert.equal(result.stderr, '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('focused tooling failure is bounded and retains complete child output', () => {
  const { result, root } = toolingFixture(`
    import assert from 'node:assert/strict';
    import test from 'node:test';
    console.log('complete child stdout sentinel');
    console.error('complete child stderr sentinel');
    test('bounded child failure headline', () => {
      assert.equal(1, 2, 'complete child assertion sentinel');
    });
  `);
  const logMatch = result.stderr.match(/^Full output: (.+)$/m);

  try {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FAILURE_CLASSIFICATION: implementation/);
    assert.match(result.stderr, /FAIL — tooling test scripts\/tests\/context-query\.test\.mjs — not ok 1 - bounded child failure headline/);
    assert.ok(Buffer.byteLength(result.stderr) < 1024);
    assert.doesNotMatch(result.stderr, /complete child (?:stdout|stderr|assertion) sentinel/);
    assert.ok(logMatch, result.stderr);
    const log = readFileSync(logMatch[1], 'utf8');
    assert.match(log, /complete child stdout sentinel/);
    assert.match(log, /complete child stderr sentinel/);
    assert.match(log, /complete child assertion sentinel/);
  } finally {
    rmSync(root, { recursive: true, force: true });
    if (logMatch) rmSync(dirname(logMatch[1]), { recursive: true, force: true });
  }
});
