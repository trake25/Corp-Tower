import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  AUTOMATION_PROTOCOL_TESTS,
  CONCEPT_KB_TESTS,
  EKS_DESTROY_VERIFIER_TEST,
  PRODUCTION_ENVIRONMENT_PREFLIGHT_TEST,
  TUTORIAL_PARITY_TEST,
  classifyQaFailure,
  selectContractQa,
  selectQa,
  selectToolingQa,
} from '../qa-gate.mjs';

const QA_GATE = resolve('scripts/qa-gate.mjs');

function toolingFixture(source, option = '--changed') {
  const root = mkdtempSync(join(tmpdir(), 'corp-qa-gate-test-'));
  const testPath = join(root, 'scripts/tests/context-query.test.mjs');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  mkdirSync(dirname(testPath), { recursive: true });
  writeFileSync(testPath, source);
  const result = spawnSync(process.execPath, [QA_GATE, option, 'scripts/tests/context-query.test.mjs'], {
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

test('agent task QA never auto-selects automation protocol tests', () => {
  const paths = [
    'scripts/qa-gate.mjs',
    'scripts/agent-observability.mjs',
    'scripts/orchestration-scope.mjs',
    'scripts/lib/task-ownership.mjs',
    'scripts/tests/context-query.test.mjs',
    'policy/CODEX.md',
    'KB/workflow/top-or-drop-workflow.md',
  ];

  for (const path of paths) {
    const plan = selectQa([path]);
    assert.equal(plan.tooling_tests.some(test => AUTOMATION_PROTOCOL_TESTS.includes(test)), false, path);
  }
  assert.deepEqual(selectToolingQa(paths.filter(path => !path.startsWith('KB/'))), { applies: false, tests: [] });
});

test('KB Tree concept paths select focused concept QA without runtime suites', () => {
  const paths = [
    'KB/docs/context/gameplay.md',
    'scripts/lib/concept-kb.mjs',
    'scripts/lib/kb-calibration.mjs',
    'scripts/fixtures/concept-retrieval.json',
    'scripts/export-kb-calibration-report.mjs',
  ];

  for (const path of paths) {
    const plan = selectQa([path]);
    assert.equal(plan.concept_kb, true);
    assert.equal(plan.runtime_applies, false);
    assert.deepEqual(plan.tooling_tests, [...CONCEPT_KB_TESTS].sort());
    assert.equal(plan.tooling_tests.some(test => AUTOMATION_PROTOCOL_TESTS.includes(test)), false);
  }
  assert.equal(selectQa(['src/Server/app/engine/Scoring.js']).concept_kb, false);
  assert.equal(AUTOMATION_PROTOCOL_TESTS.includes('scripts/tests/concept-kb.test.mjs'), false);
  assert.equal(AUTOMATION_PROTOCOL_TESTS.includes('scripts/tests/kb-calibration.test.mjs'), false);
});

test('both sides of the tutorial defaults contract select the parity test', () => {
  const paths = [
    'src/Server/app/Game_Config.js',
    'src/Client/App/corp-tower/Cor/Scripts/GameUi/Tutorial/TutorialLessons.gd',
    'scripts/lib/tutorial-defaults-parity.mjs',
    TUTORIAL_PARITY_TEST,
  ];

  for (const path of paths) {
    assert.deepEqual(selectContractQa([path]).tests, [TUTORIAL_PARITY_TEST]);
    assert.deepEqual(selectToolingQa([path]).tests, []);
    assert.deepEqual(selectQa([path]).contract_tests, [TUTORIAL_PARITY_TEST]);
  }
});

test('unrelated product paths do not select tutorial defaults parity', () => {
  const contracts = selectContractQa([
    'src/Server/app/engine/Scoring.js',
    'src/Client/App/corp-tower/Cor/Scripts/GameUi/InventoryController.gd',
  ]);

  assert.deepEqual(contracts.tests, []);
});

test('EKS destroy verifier changes select only its focused regression test', () => {
  const paths = [
    '.github/actions/verify-eks-destroy/action.yml',
    '.github/actions/verify-eks-destroy/verify.sh',
    EKS_DESTROY_VERIFIER_TEST,
  ];

  for (const path of paths) {
    assert.deepEqual(selectContractQa([path]).tests, [EKS_DESTROY_VERIFIER_TEST]);
    assert.deepEqual(selectQa([path]).contract_tests, [EKS_DESTROY_VERIFIER_TEST]);
  }
  assert.deepEqual(selectContractQa(['.github/actions/aws-terraform-setup/action.yml']).tests, []);
});

test('Production preflight changes select the strict environment regression test', () => {
  const paths = [
    '.github/workflows/Production-Environment-Preflight.yml',
    'scripts/verify-production-environment.mjs',
    PRODUCTION_ENVIRONMENT_PREFLIGHT_TEST,
  ];

  for (const path of paths) {
    assert.deepEqual(
      selectContractQa([path]).tests,
      [PRODUCTION_ENVIRONMENT_PREFLIGHT_TEST],
    );
  }
});

test('protocol test paths do not become automatic task QA', () => {
  const { result, root } = toolingFixture(`
    import test from 'node:test';
    test('verbose child success sentinel', () => {});
  `);

  try {
    assert.equal(result.status, 0, JSON.stringify({ signal: result.signal, error: result.error?.message, stdout: result.stdout, stderr: result.stderr }));
    assert.equal(result.stdout.trim(), 'PASS — no runtime, tooling, or contract QA applies to the supplied paths');
    assert.doesNotMatch(result.stdout, /TAP version|Subtest|verbose child success sentinel/);
    assert.equal(result.stderr, '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('explicit tooling tests keep successful TAP private and reject unapproved paths', () => {
  const { result, root } = toolingFixture("import test from 'node:test'; test('explicit success', () => {});\n", '--tooling-test');
  try {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), 'PASS — explicit tooling tests (1)');
    assert.ok(Buffer.byteLength(result.stdout) < 1024);
    assert.doesNotMatch(result.stdout, /TAP version|Subtest/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const invalid = spawnSync(process.execPath, [QA_GATE, '--tooling-test', 'README.md'], { cwd: process.cwd(), encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /approved tooling test/);
});

test('manual tooling failure is bounded and retains complete child output', () => {
  const { result, root } = toolingFixture(`
    import assert from 'node:assert/strict';
    import test from 'node:test';
    console.log('complete child stdout sentinel');
    console.error('complete child stderr sentinel');
    test('bounded child failure headline', () => {
      assert.equal(1, 2, 'complete child assertion sentinel');
    });
  `, '--tooling-test');
  const logMatch = result.stderr.match(/^Full output: (.+)$/m);

  try {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /FAILURE_CLASSIFICATION: implementation/);
    assert.match(result.stderr, /FAIL — explicit tooling test scripts\/tests\/context-query\.test\.mjs — not ok 1 - bounded child failure headline/);
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
