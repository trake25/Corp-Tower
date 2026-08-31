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
  fallbackRequiresRetrievalProof,
  intakeForManifest,
  publishPathsFor,
  recordFallback,
  retrievalFallbackMaintenanceItems,
  reviewForManifest,
  reviewManifest,
  startObservability,
  validateDocumentationDecision,
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
  assert.equal(manifest.documentation.status, 'pending');
  assert.equal(manifest.coverage.status, 'pending');
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
  const reviewed = reviewManifest(manifest, { changedPaths: [SOURCE], mapBaseline: { 'docs/context/map/backend.md': 'before' } });
  assert.equal(reviewed.phase, 'reviewed');
  assert.deepEqual(reviewed.changed_paths, [SOURCE]);
  assert.deepEqual(reviewed.documentation.candidate_docs, [DOC]);
  assert.deepEqual(reviewed.review.intake.qa.server_tests, ['Gameplay_Events.test.js', 'Placement_Geometry.test.js', 'Stability_Scoring.test.js']);
  assert.equal(reviewed.documentation.status, 'pending');
  assert.deepEqual(reviewed.review.map_hashes, { 'docs/context/map/backend.md': 'before' });
  const repeated = reviewManifest(reviewed, { changedPaths: [SOURCE], mapBaseline: { 'docs/context/map/backend.md': 'after' } });
  assert.deepEqual(repeated.review.map_hashes, { 'docs/context/map/backend.md': 'before' });
});

test('amend preserves reviewed source scope for a candidate doc and invalidates it for new source', () => {
  const prepared = createManifest({ task: 'Verify scoring closeout', ownedPaths: [SOURCE] });
  const reviewed = reviewManifest(prepared, { changedPaths: [SOURCE] });
  const withDoc = amendManifest(reviewed, [DOC]);

  assert.equal(withDoc.phase, 'reviewed');
  assert.equal(withDoc.review.input_fingerprint, reviewed.review.input_fingerprint);
  assert.ok(withDoc.owned_paths.includes(DOC));

  const withSource = amendManifest(withDoc, ['src/Server/app/Game_Engine.js']);
  assert.equal(withSource.phase, 'prepared');
  assert.equal(withSource.review, null);
  assert.deepEqual(withSource.changed_paths, []);
});

test('source-changing closeout requires an updated or not-needed documentation decision', () => {
  const prepared = createManifest({ task: 'Verify scoring closeout', ownedPaths: [SOURCE, DOC] });
  const reviewed = reviewManifest(prepared, { changedPaths: [SOURCE, DOC] });

  assert.throws(() => validateDocumentationDecision(reviewed), /pending/);
  assert.throws(() => applyDocumentationDecision(reviewed, {
    decision: 'not-needed',
    reason: 'x'.repeat(241),
  }), /at most 240/);
  const updated = applyDocumentationDecision(reviewed, {
    decision: 'updated',
    reason: 'The authoritative scoring flow changed.',
    documentedPaths: [DOC],
  });
  assert.doesNotThrow(() => validateDocumentationDecision(updated));
  assert.equal(updated.documentation.status, 'updated');
  assert.equal(updated.documentation.reason, 'The authoritative scoring flow changed.');
  assert.deepEqual(updated.documented_paths, [DOC]);
  assert.ok(updated.publish_paths.includes(DOC));

  const notNeeded = applyDocumentationDecision(reviewManifest(prepared, { changedPaths: [SOURCE] }), {
    decision: 'not-needed',
    reason: 'The refactor does not change a system-level contract.',
  });
  assert.doesNotThrow(() => validateDocumentationDecision(notNeeded));
  assert.equal(notNeeded.documentation.status, 'not-needed');
  assert.deepEqual(notNeeded.documented_paths, []);
});

test('updated documentation must be owned, affected, and present in the reviewed change set', () => {
  const unrelatedDoc = 'docs/context/gameplay.md';
  const prepared = createManifest({ task: 'Verify scoring docs', ownedPaths: [SOURCE, DOC, unrelatedDoc] });
  const withoutDocChange = reviewManifest(prepared, { changedPaths: [SOURCE] });
  assert.throws(() => applyDocumentationDecision(withoutDocChange, {
    decision: 'updated',
    reason: 'Scoring changed.',
    documentedPaths: [DOC],
  }), /reviewed change set/);

  const withUnrelatedDoc = reviewManifest(prepared, { changedPaths: [SOURCE, unrelatedDoc] });
  assert.throws(() => applyDocumentationDecision(withUnrelatedDoc, {
    decision: 'updated',
    reason: 'Scoring changed.',
    documentedPaths: [unrelatedDoc],
  }), /documentation scope/);
});

test('permanent coverage is a required decision independent of QA selection', () => {
  const testPath = 'src/Server/tests/Stability_Scoring.test.js';
  const prepared = createManifest({ task: 'Retune scoring safely', ownedPaths: [SOURCE, testPath] });
  const withoutTest = reviewManifest(prepared, { changedPaths: [SOURCE] });

  assert.equal(withoutTest.coverage.status, 'pending');
  assert.throws(() => applyCoverageDecision(withoutTest, { status: 'updated', protectedContract: 'Protect scoring.' }), /changed test path/);
  const reused = applyCoverageDecision(withoutTest, { status: 'reused' });
  assert.equal(reused.coverage.status, 'reused');

  const withTest = reviewManifest(prepared, { changedPaths: [SOURCE, testPath] });
  const updated = applyCoverageDecision(withTest, { status: 'updated', protectedContract: 'Protects the durable scoring invariant.' });
  assert.equal(updated.coverage.status, 'updated');
  assert.equal(updated.coverage.protected_contract, 'Protects the durable scoring invariant.');
});

test('planned QA tooling is recorded and unplanned tooling remains a visible scope expansion', () => {
  const prepared = createManifest({
    task: 'Update QA orchestration',
    ownedPaths: ['scripts/qa-gate.mjs'],
    plannedQaToolingPaths: ['scripts/qa-gate.mjs'],
  });
  const planned = reviewManifest(prepared, { changedPaths: ['scripts/qa-gate.mjs'] });
  assert.equal(planned.qa.status, 'planned-change');

  const unplanned = reviewManifest(createManifest({
    task: 'Unexpected QA helper',
    ownedPaths: ['scripts/qa-gate.mjs'],
  }), { changedPaths: ['scripts/qa-gate.mjs'] });
  assert.equal(unplanned.qa.status, 'unplanned-change');
  assert.deepEqual(unplanned.qa.unplanned_paths, ['scripts/qa-gate.mjs']);
});

test('ordinary fallback defers retrieval repair without forcing fixture proof', () => {
  const manifest = createManifest({ task: 'Repair retrieval', ownedPaths: ['scripts/context.mjs'] });
  assert.throws(() => recordFallback(manifest, { query: 'splash', classification: 'usage-error', searchedRoot: 'src', fixture: 'anchor-retry' }), /classification/);
  const recorded = recordFallback(manifest, { query: 'splash', classification: 'retrieval-defect', searchedRoot: 'src/Client' });
  const duplicate = recordFallback(recorded, { query: 'splash', classification: 'retrieval-defect', searchedRoot: 'src/Client' });
  assert.equal(duplicate.retrieval.fallbacks.length, 1);
  assert.equal(duplicate.retrieval.fallbacks[0].disposition, 'deferred-repair');
  assert.equal(fallbackRequiresRetrievalProof(duplicate), false);
  assert.equal(retrievalFallbackMaintenanceItems(duplicate)[0].state, 'advisory');
});

test('fixture-backed retrieval maintenance retains benchmark proof', () => {
  const manifest = createManifest({ task: 'Repair retrieval', ownedPaths: ['scripts/context.mjs'] });
  const recorded = recordFallback(manifest, {
    query: 'splash',
    classification: 'retrieval-defect',
    searchedRoot: 'src/Client',
    fixture: 'anchor-retry',
  });
  assert.equal(recorded.retrieval.fallbacks[0].disposition, 'task-owned-repair');
  assert.equal(fallbackRequiresRetrievalProof(recorded), true);
  assert.deepEqual(retrievalFallbackMaintenanceItems(recorded), []);
});

test('deferred retrieval repair writes one advisory handoff without blocking a pass', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-retrieval-advisory-'));
  try {
    const manifest = recordFallback(
      createManifest({ task: 'Product change with fallback', ownedPaths: [SOURCE] }),
      { query: 'scoring owner', classification: 'retrieval-defect', searchedRoot: 'src/Server/app' },
    );
    const result = resolveMaintenanceHandoff({
      root,
      task: manifest.task,
      runId: manifest.run_id,
      steps: [{ name: 'QA', status: 0, command: ['node', 'scripts/qa-gate.mjs'], summary: 'exit 0' }],
      changedPaths: [SOURCE],
      advisoryItems: retrievalFallbackMaintenanceItems(manifest),
    });

    assert.equal(result.status, 'passed');
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].classification, 'retrieval-map-maintenance');
    assert.match(readFileSync(join(root, result.handoff), 'utf8'), /scoring owner/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
    const handoff = readFileSync(join(root, result.handoff), 'utf8');
    assert.match(handoff, /tooling-environment/);
    assert.match(handoff, /missing root Godot binary/);
    assert.doesNotMatch(handoff, /- State:|- Verification impact:/);
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

test('a documentation-only review needs no source documentation or permanent-coverage decision', () => {
  const manifest = createManifest({ task: 'Validate documentation only', ownedPaths: ['docs/context/testing.md'] });
  const reviewed = reviewManifest(manifest, { changedPaths: ['docs/context/testing.md'] });
  assert.equal(reviewed.documentation.source_changed, false);
  assert.equal(reviewed.documentation.status, 'not-applicable');
  assert.equal(reviewed.coverage.status, 'none');
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

test('CLI review directs source-changing closeout through the documentation gate', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-task-close-source-'));
  const manifest = '.agent-state/source-contract.json';
  const run = args => spawnSync(process.execPath, ['scripts/task-close.mjs', ...args], {
    cwd: process.cwd(),
    env: { ...process.env, TASK_CLOSE_ROOT: root, CODEX_SESSION_ID: '', CODEX_THREAD_ID: '' },
    encoding: 'utf8',
  });

  try {
    const prepared = run(['prepare', '--task', 'Source contract', '--output', manifest, '--path', SOURCE]);
    assert.equal(prepared.status, 0, prepared.stderr);
    const reviewed = run(['review', '--manifest', manifest, '--changed', SOURCE]);
    assert.equal(reviewed.status, 0, reviewed.stderr);
    const output = reviewForManifest(JSON.parse(readFileSync(join(root, manifest), 'utf8')), manifest);
    assert.equal(output.documentation_status, 'pending');
    assert.match(output.next, /--decision/);
    assert.match(output.next, /updated\|not-needed/);
    assert.match(output.next, /--doc-path/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
