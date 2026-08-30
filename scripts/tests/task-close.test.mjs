import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { selectQa } from '../qa-gate.mjs';
import { renderPrivateReports } from '../lib/agent-observability/report.mjs';
import { readTaskBundle } from '../lib/agent-observability/state.mjs';
import {
  createMaintenanceItem,
  resolveMaintenanceHandoff,
  terminalStatusForSteps,
} from '../lib/maintenance-handoff.mjs';
import {
  amendManifest,
  applyCoverageDecision,
  applyDocumentationDecision,
  closeObservabilityUnsafe,
  createManifest,
  deriveTaskComplexity,
  intakeForManifest,
  publishPathsFor,
  recordFallback,
  reviewManifest,
  startObservability,
} from '../task-close.mjs';

const SOURCE = 'src/Server/app/engine/Scoring.js';
const DOC = 'docs/context/backend.md';

test('QA planner preserves targeted server and client selection', () => {
  const plan = selectQa([SOURCE, 'src/Client/App/corp-tower/Cor/Scripts/GameUi/SnapGrid.gd']);
  assert.equal(plan.full_server, false);
  assert.deepEqual(plan.server_tests, ['Gameplay_Events.test.js', 'Placement_Geometry.test.js', 'Stability_Scoring.test.js']);
  assert.equal(plan.client_runtime, true);
  assert.deepEqual(plan.client_tests, ['GameUi/test_snap_grid.gd']);
});

test('prepare creates a compact schema-v2 ownership manifest and intake', () => {
  const manifest = createManifest({ task: 'Verify scoring closeout', ownedPaths: [SOURCE] });

  assert.equal(manifest.schema_version, 2);
  assert.equal(manifest.phase, 'prepared');
  assert.deepEqual(manifest.owned_paths, [SOURCE]);
  assert.deepEqual(manifest.changed_paths, []);
  assert.equal(manifest.coverage.decision, 'pending');
  assert.deepEqual(manifest.intake.docs, [DOC]);
  assert.deepEqual(manifest.intake.maps, ['docs/context/map/backend.md']);
  assert.deepEqual(manifest.intake.qa.server_tests, ['Gameplay_Events.test.js', 'Placement_Geometry.test.js', 'Stability_Scoring.test.js']);
  assert.ok(manifest.intake.tools.some(tool => tool.name === 'QA'));
  const intake = intakeForManifest(manifest, '.agent-state/automation/task.json');
  assert.deepEqual(intake.owned_paths, [SOURCE]);
  assert.ok(Buffer.byteLength(JSON.stringify(intake, null, 2)) + 1 <= 8 * 1024);
});

test('task binding derives a bounded complexity instead of unknown', () => {
  assert.equal(deriveTaskComplexity({ owned_paths: [DOC] }).complexity, 'C1');
  assert.equal(deriveTaskComplexity({ owned_paths: [SOURCE] }).complexity, 'C2');
  assert.equal(deriveTaskComplexity({ owned_paths: [
    'scripts/agent-observability.mjs',
    'scripts/codex-observability-hook.mjs',
    'scripts/task-close.mjs',
    'scripts/tests/agent-observability.test.mjs',
  ] }).complexity, 'C3');
  assert.equal(deriveTaskComplexity({ owned_paths: Array.from({ length: 9 }, (_, index) => `scripts/tool-${index}.mjs`) }).complexity, 'C4');
});

test('closeout without a Stop binding remains pending and stays out of weekly reports', () => {
  const state = mkdtempSync(join(tmpdir(), 'corp-task-observability-'));
  const env = {
    CORP_TOWER_OBSERVABILITY_DIR: state,
    CODEX_SESSION_ID: '',
    CODEX_THREAD_ID: '',
  };
  try {
    const manifest = createManifest({ task: 'Pending telemetry task', ownedPaths: [SOURCE], runId: 'pending-telemetry-task' });
    manifest.observability = startObservability(manifest, env);
    const result = closeObservabilityUnsafe(manifest, {
      status: 'passed',
      steps: [],
      publish_paths: [],
    }, env);
    const bundle = readTaskBundle(state, manifest.run_id);

    assert.equal(result.status, 'partial');
    assert.equal(bundle.final.status, 'pending');
    assert.equal(bundle.final.finalized_at, null);
    assert.deepEqual(renderPrivateReports(state), []);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('review accepts only owned final paths and refreshes docs and QA from them', () => {
  const manifest = createManifest({ task: 'Verify scoring closeout', ownedPaths: [SOURCE, 'scripts/context.mjs'] });

  assert.throws(() => reviewManifest(manifest, { changedPaths: ['src/Server/app/Game_Engine.js'] }), /not owned/);
  const reviewed = reviewManifest(manifest, { changedPaths: [SOURCE], scope: { status: 0, output: 'backend.md:10-20' }, mapBaseline: { 'docs/context/map/backend.md': 'before' } });
  assert.equal(reviewed.phase, 'reviewed');
  assert.deepEqual(reviewed.changed_paths, [SOURCE]);
  assert.deepEqual(reviewed.documentation.candidate_docs, [DOC]);
  assert.deepEqual(reviewed.review.intake.qa.server_tests, ['Gameplay_Events.test.js', 'Placement_Geometry.test.js', 'Stability_Scoring.test.js']);
  assert.equal(reviewed.documentation.scope.output, 'backend.md:10-20');
  assert.deepEqual(reviewed.review.map_hashes, { 'docs/context/map/backend.md': 'before' });
  const repeated = reviewManifest(reviewed, { changedPaths: [SOURCE], scope: reviewed.documentation.scope, mapBaseline: { 'docs/context/map/backend.md': 'after' } });
  assert.deepEqual(repeated.review.map_hashes, { 'docs/context/map/backend.md': 'before' });
});

test('amend preserves reviewed source scope for a candidate doc and invalidates it for new source', () => {
  const prepared = createManifest({ task: 'Verify scoring closeout', ownedPaths: [SOURCE] });
  const reviewed = reviewManifest(prepared, { changedPaths: [SOURCE], scope: { status: 0, output: 'backend.md:10-20' } });
  const withDoc = amendManifest(reviewed, [DOC]);

  assert.equal(withDoc.phase, 'reviewed');
  assert.equal(withDoc.review.input_fingerprint, reviewed.review.input_fingerprint);
  assert.ok(withDoc.owned_paths.includes(DOC));

  const withSource = amendManifest(withDoc, ['src/Server/app/Game_Engine.js']);
  assert.equal(withSource.phase, 'prepared');
  assert.equal(withSource.review, null);
  assert.deepEqual(withSource.changed_paths, []);
});

test('documentation decisions require rationale, scope, and pre-edit ownership', () => {
  const prepared = createManifest({ task: 'Verify scoring closeout', ownedPaths: [SOURCE] });
  const reviewed = reviewManifest(prepared, { changedPaths: [SOURCE], scope: { status: 0, output: 'backend.md:10-20' } });

  assert.throws(() => applyDocumentationDecision(reviewed, { decision: 'updated', reason: 'Scoring behavior changed.' }), /doc-path/);
  assert.throws(() => applyDocumentationDecision(reviewed, { decision: 'not-needed', reason: '', documentedPaths: [] }), /plain-English reason/);
  assert.throws(() => applyDocumentationDecision(reviewed, { decision: 'updated', reason: 'Scoring behavior changed.', documentedPaths: [DOC] }), /owned/);

  const owned = amendManifest(reviewed, [DOC]);
  const updated = applyDocumentationDecision(owned, { decision: 'updated', reason: 'Scoring behavior changed.', documentedPaths: [DOC] });
  assert.equal(updated.documentation.decision, 'updated');
  assert.deepEqual(updated.documented_paths, [DOC]);
  assert.deepEqual(updated.publish_paths, [DOC, SOURCE]);
});

test('permanent coverage is a required decision independent of QA selection', () => {
  const testPath = 'src/Server/tests/Stability_Scoring.test.js';
  const prepared = createManifest({ task: 'Retune scoring safely', ownedPaths: [SOURCE, testPath] });
  const withoutTest = reviewManifest(prepared, { changedPaths: [SOURCE], scope: { status: 0, output: 'backend.md:10-20' } });

  assert.equal(withoutTest.coverage.decision, 'pending');
  assert.throws(() => applyCoverageDecision(withoutTest, { decision: 'updated', reason: 'Protect scoring.' }), /changed test path/);
  const noPermanentTest = applyCoverageDecision(withoutTest, { decision: 'not-needed', reason: 'Existing invariant coverage exercises the retune.' });
  assert.equal(noPermanentTest.coverage.decision, 'not-needed');

  const withTest = reviewManifest(prepared, { changedPaths: [SOURCE, testPath], scope: { status: 0, output: 'backend.md:10-20' } });
  const updated = applyCoverageDecision(withTest, { decision: 'updated', reason: 'Adds a durable scoring invariant.' });
  assert.equal(updated.coverage.decision, 'updated');
});

test('fallback recording is restricted and deduplicated', () => {
  const manifest = createManifest({ task: 'Repair retrieval', ownedPaths: ['scripts/context.mjs'] });
  assert.throws(() => recordFallback(manifest, { query: 'splash', classification: 'usage-error', searchedRoot: 'src', fixture: 'anchor-retry' }), /classification/);
  const recorded = recordFallback(manifest, { query: 'splash', classification: 'retrieval-defect', searchedRoot: 'src/Client', fixture: 'anchor-retry' });
  const duplicate = recordFallback(recorded, { query: 'splash', classification: 'retrieval-defect', searchedRoot: 'src/Client', fixture: 'anchor-retry' });
  assert.equal(duplicate.retrieval.fallbacks.length, 1);
});

test('publication scope includes explicit, documented, and content-derived paths', () => {
  assert.deepEqual(
    publishPathsFor([SOURCE], [DOC], ['docs/context/map/backend.md', SOURCE]),
    [DOC, 'docs/context/map/backend.md', SOURCE],
  );
});

test('maintenance terminal outcomes distinguish passed, maintenance-blocked, and failed work', () => {
  assert.equal(terminalStatusForSteps([{ status: 0 }]), 'passed');
  assert.equal(terminalStatusForSteps([{ status: 1, classification: 'tooling-environment' }]), 'maintenance-blocked');
  assert.equal(terminalStatusForSteps([
    { status: 1, classification: 'tooling-environment' },
    { status: 1, classification: 'implementation' },
  ]), 'failed');
});

test('maintenance handoffs are run-scoped, compact, and never auto-delete another run', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-maintenance-handoff-'));
  try {
    mkdirSync(join(root, 'repair'), { recursive: true });
    const other = join(root, 'repair', 'other-run.md');
    writeFileSync(other, 'keep this handoff\n');
    const result = resolveMaintenanceHandoff({
      root,
      task: 'Repair close-out tooling',
      runId: '12345678-aaaa-bbbb-cccc-dddddddddddd',
      steps: [{
        name: 'QA',
        status: 1,
        classification: 'tooling-environment',
        command: ['node', 'scripts/qa-gate.mjs'],
        summary: 'exit 1; missing root Godot binary',
      }],
      changedPaths: [],
    });

    assert.equal(result.status, 'maintenance-blocked');
    assert.equal(result.handoff, 'repair/repair-close-out-tooling-12345678.md');
    assert.match(readFileSync(join(root, result.handoff), 'utf8'), /tooling-environment/);
    assert.match(readFileSync(join(root, result.handoff), 'utf8'), /missing root Godot binary/);
    assert.equal(readFileSync(other, 'utf8'), 'keep this handoff\n');
    assert.throws(() => createMaintenanceItem({ state: 'blocking', classification: 'implementation' }), /not allowed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('advisory decomposition handoffs preserve a passing verification result', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-maintenance-advisory-'));
  try {
    const source = join(root, 'src/Server/app/Large.js');
    mkdirSync(join(root, 'src/Server/app'), { recursive: true });
    writeFileSync(source, `${Array.from({ length: 900 }, () => 'const value = 1;').join('\n')}\n`);
    const result = resolveMaintenanceHandoff({
      root,
      task: 'Small server change',
      runId: 'abcdefgh-aaaa-bbbb-cccc-dddddddddddd',
      steps: [{ name: 'QA', status: 0, command: ['node', 'scripts/qa-gate.mjs'], summary: 'exit 0' }],
      changedPaths: ['src/Server/app/Large.js'],
    });

    assert.equal(result.status, 'passed');
    assert.equal(result.items[0].state, 'advisory');
    assert.equal(result.items[0].classification, 'architecture-decomposition');
    assert.match(readFileSync(join(root, result.handoff), 'utf8'), /Advisory/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('publication scope always excludes maintenance handoffs', () => {
  assert.deepEqual(
    publishPathsFor([SOURCE, 'repair/repair-12345678.md'], [DOC], ['repair/map-note.md']),
    [DOC, SOURCE],
  );
});

test('a documentation-only review does not request a source documentation decision', () => {
  const manifest = createManifest({ task: 'Validate documentation only', ownedPaths: ['docs/context/testing.md'] });
  const reviewed = reviewManifest(manifest, { changedPaths: ['docs/context/testing.md'] });
  assert.equal(reviewed.documentation.source_changed, false);
  assert.equal(reviewed.documentation.decision, 'not-needed');
  assert.equal(reviewed.coverage.decision, 'not-needed');
});

test('CLI review accepts repository-contract changes without a documentation-scope process', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-task-close-'));
  const manifest = '.agent-state/contract.json';
  const run = args => spawnSync(process.execPath, ['scripts/task-close.mjs', ...args], {
    cwd: process.cwd(),
    env: { ...process.env, TASK_CLOSE_ROOT: root, CODEX_SESSION_ID: '', CODEX_THREAD_ID: '' },
    encoding: 'utf8',
  });

  try {
    const prepared = run(['prepare', '--task', 'Contract wording', '--output', manifest, '--path', 'AGENTS.md']);
    assert.equal(prepared.status, 0, prepared.stderr);
    const preparedManifest = JSON.parse(readFileSync(join(root, manifest), 'utf8'));
    assert.equal(preparedManifest.observability.task_id, preparedManifest.run_id);
    assert.equal(preparedManifest.observability.status, 'partial');
    assert.deepEqual(preparedManifest.observability.reasons, ['codex_session_id_unavailable']);
    const reviewed = run(['review', '--manifest', manifest, '--changed', 'AGENTS.md']);
    assert.equal(reviewed.status, 0, reviewed.stderr);
    assert.equal(JSON.parse(readFileSync(join(root, manifest), 'utf8')).phase, 'reviewed');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
