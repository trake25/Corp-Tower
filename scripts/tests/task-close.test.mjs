import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
import { publicQaReceiptPath, renderPublicQaReceipt, writePublicQaReceipt } from '../lib/qa-receipt.mjs';
import { createTaskIdentity, taskIdentityBase, taskIdentityForManifest } from '../lib/task-identity.mjs';
import {
  amendManifest,
  archivePlan,
  applyCoverageDecision,
  applyDocumentationDecision,
  closeObservabilityUnsafe,
  compactOutput,
  createManifest,
  deriveTaskComplexity,
  fallbackRequiresRetrievalProof,
  intakeForManifest,
  planBindingFor,
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
const TASK_CLOSE = resolve('scripts/task-close.mjs');
const RECEIPT_IDENTITY = Object.freeze({
  keywords: ['Public', 'QA', 'Receipts'],
  keyword_label: 'Public QA Receipts',
  slug: 'public-qa-receipts',
  version: '0.01',
  label: 'Public QA Receipts v0.01',
});

test('successful compact summaries ignore diagnostics and prefer an explicit PASS line', () => {
  const misleadingSuccess = [
    '# Subtest: focused tooling failure is bounded and retains complete child output',
    'ok 1 - focused tooling failure is bounded and retains complete child output',
  ].join('\n');

  assert.equal(compactOutput(misleadingSuccess, { status: 0 }), 'exit 0');
  assert.equal(compactOutput(`${misleadingSuccess}\nPASS — tooling targeted tests (4)`, { status: 0 }), 'exit 0; PASS — tooling targeted tests (4)');
  assert.equal(compactOutput('FAIL — child assertion failed', { status: 1 }), 'exit 1; FAIL — child assertion failed');
  assert.equal(
    compactOutput('ACTIONABLE_BLOCKER: compaction-required: automation.md section "Close-out" ~1700 tok > hard limit 1600\nFAILURE_CLASSIFICATION: implementation\nFAIL', { status: 1 }),
    'exit 1; ACTIONABLE_BLOCKER: compaction-required: automation.md section "Close-out" ~1700 tok > hard limit 1600; FAILURE_CLASSIFICATION: implementation',
  );
  assert.equal(compactOutput('Error: child interrupted', { signal: 'SIGTERM' }), 'signal SIGTERM; Error: child interrupted');
});

test('shared task identity preserves Git keywords and selects the next receipt/history version', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-task-identity-'));
  try {
    mkdirSync(join(root, 'report/qa-receipts'), { recursive: true });
    writeFileSync(join(root, 'report/qa-receipts/qa-receipt-reconnect-idle-bug-v0.99.md'), 'existing\n');
    assert.deepEqual(taskIdentityBase('Implement the Reconnect Idle Bug fix'), {
      keywords: ['Reconnect', 'Idle', 'Bug'],
      keyword_label: 'Reconnect Idle Bug',
      slug: 'reconnect-idle-bug',
    });
    const identity = createTaskIdentity('Implement the Reconnect Idle Bug fix', {
      root,
      subjects: ['Reconnect Idle Bug v1.01', 'Unrelated Work v9.99'],
    });
    assert.deepEqual(identity, {
      keywords: ['Reconnect', 'Idle', 'Bug'],
      keyword_label: 'Reconnect Idle Bug',
      slug: 'reconnect-idle-bug',
      version: '1.02',
      label: 'Reconnect Idle Bug v1.02',
    });
    assert.deepEqual(taskIdentityForManifest({
      task: 'Implement the Reconnect Idle Bug fix',
      task_identity: identity,
    }, { root, subjects: ['Reconnect Idle Bug v8.00'] }), identity);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('public receipt rendering is deterministic and projects only sanitized terminal evidence', () => {
  const data = {
    identity: RECEIPT_IDENTITY,
    task: 'Public QA receipts and shared task identity',
    verificationStatus: 'passed',
    changedPaths: ['scripts/task-close.mjs'],
    publishPaths: ['scripts/task-close.mjs', publicQaReceiptPath(RECEIPT_IDENTITY)],
    steps: [{
      name: 'QA',
      status: 0,
      summary: 'exit 0; /home/alice/Corp-Tower/run.log /Users/bob/Corp-Tower/run.log C:\\Users\\carol\\Corp-Tower\\run.log /usr/bin/node',
      output: 'RAW_CHILD_OUTPUT_SENTINEL',
      telemetry: { session: 'PRIVATE_SESSION_SENTINEL' },
    }],
    coverage: { status: 'updated', protected_contract: 'Public receipts cannot expose raw output.' },
    qa: { temporary_verification: 'not-used', status: 'planned-change' },
    maintenanceItems: [],
    prompt: 'PRIVATE_PROMPT_SENTINEL',
  };
  const receipt = renderPublicQaReceipt(data);

  assert.equal(receipt, renderPublicQaReceipt(data));
  assert.match(receipt, /Implementation: COMPLETED/);
  assert.match(receipt, /Verification: PASSED/);
  assert.match(receipt, /QA — PASS/);
  assert.match(receipt, /Permanent coverage: updated/);
  assert.match(receipt, /Protected contract: Public receipts cannot expose raw output/);
  assert.match(receipt, /QA tooling: planned-change/);
  assert.match(receipt, /report\/qa-receipts\/qa-receipt-public-qa-receipts-v0\.01\.md/);
  assert.match(receipt, /\/usr\/bin\/node/);
  assert.match(receipt, /\[private path\]/);
  assert.doesNotMatch(receipt, /alice|bob|carol|RAW_CHILD_OUTPUT_SENTINEL|PRIVATE_SESSION_SENTINEL|PRIVATE_PROMPT_SENTINEL/);
});

test('maintenance-blocked public receipts expose compact classification and follow-up without private fields', () => {
  const maintenance = createMaintenanceItem({
    state: 'blocking',
    classification: 'tooling-environment',
    stage: 'QA',
    affected: 'node scripts/qa-gate.mjs',
    diagnostic: 'exit 1; missing test executable',
    verificationImpact: 'QA could not provide required proof.',
    completed: 'Implementation completed.',
    recommendedFollowUp: 'Restore the executable and rerun QA.',
  });
  const receipt = renderPublicQaReceipt({
    identity: RECEIPT_IDENTITY,
    task: 'Public QA receipts and shared task identity',
    verificationStatus: 'maintenance-blocked',
    changedPaths: ['scripts/task-close.mjs'],
    publishPaths: [publicQaReceiptPath(RECEIPT_IDENTITY), 'scripts/task-close.mjs'],
    steps: [{
      name: 'QA',
      status: 1,
      classification: 'tooling-environment',
      summary: 'exit 1; log at .agent-state/automation/private.log API_TOKEN=secret-value',
      output: 'RAW_BLOCKED_OUTPUT_SENTINEL',
    }],
    coverage: { status: 'reused' },
    qa: { temporary_verification: 'used', status: 'planned-change' },
    maintenanceItems: [maintenance],
  });

  assert.match(receipt, /Verification: MAINTENANCE-BLOCKED/);
  assert.match(receipt, /QA — BLOCKED/);
  assert.match(receipt, /Failure classification: tooling-environment/);
  assert.match(receipt, /Diagnostic \/ impact: exit 1; missing test executable QA could not provide required proof/);
  assert.match(receipt, /Follow-up: Restore the executable and rerun QA/);
  assert.match(receipt, /\[private path\]/);
  assert.match(receipt, /API_TOKEN=\[redacted\]/);
  assert.doesNotMatch(receipt, /private\.log|secret-value|RAW_BLOCKED_OUTPUT_SENTINEL/);
  assert.throws(() => renderPublicQaReceipt({
    identity: RECEIPT_IDENTITY,
    task: 'Public QA receipts and shared task identity',
    verificationStatus: 'passed',
    steps: [{ status: 1, classification: 'implementation', summary: 'exit 1' }],
  }), /does not match its executable proof/);
});

test('public receipt writer uses the identity path and stable content', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-public-receipt-'));
  try {
    const data = {
      identity: RECEIPT_IDENTITY,
      task: 'Public QA receipts and shared task identity',
      verificationStatus: 'passed',
      steps: [{ name: 'QA', status: 0, summary: 'exit 0' }],
    };
    const path = writePublicQaReceipt(root, data);
    assert.equal(path, publicQaReceiptPath(RECEIPT_IDENTITY));
    assert.equal(readFileSync(join(root, path), 'utf8'), renderPublicQaReceipt(data));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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
  assert.deepEqual(manifest.lifecycle, { status: 'open' });
  assert.equal(manifest.plan.status, 'not-applicable');
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

test('optional plan binding accepts only an active Markdown plan with a free deterministic archive', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-task-plan-binding-'));
  try {
    mkdirSync(join(root, 'plan/done'), { recursive: true });
    mkdirSync(join(root, 'plan/nested'), { recursive: true });
    writeFileSync(join(root, 'plan/nested/task.md'), '# Task\n');
    writeFileSync(join(root, 'plan/not-markdown.txt'), 'Task\n');
    writeFileSync(join(root, 'plan/done/closed.md'), '# Closed\n');

    assert.deepEqual(planBindingFor('plan/nested/task.md', root), {
      status: 'pending',
      source_path: 'plan/nested/task.md',
      archive_path: 'plan/done/task.md',
      diagnostic: null,
    });
    assert.throws(() => planBindingFor('../outside.md', root), /inside the repository/);
    assert.throws(() => planBindingFor('plan/not-markdown.txt', root), /Markdown/);
    assert.throws(() => planBindingFor('plan/done/closed.md', root), /cannot already/);
    writeFileSync(join(root, 'plan/done/task.md'), '# Collision\n');
    assert.throws(() => planBindingFor('plan/nested/task.md', root), /destination already exists/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('late plan binding cannot replace a different task plan', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-task-plan-amend-'));
  try {
    mkdirSync(join(root, 'plan'), { recursive: true });
    writeFileSync(join(root, 'plan/first.md'), '# First\n');
    writeFileSync(join(root, 'plan/second.md'), '# Second\n');
    const manifest = createManifest({ task: 'Bind later', ownedPaths: [SOURCE] });
    const first = amendManifest(manifest, [], [], planBindingFor('plan/first.md', root));

    assert.equal(first.plan.source_path, 'plan/first.md');
    assert.throws(
      () => amendManifest(first, [], [], planBindingFor('plan/second.md', root)),
      /already bound/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('plan archival is idempotent and never overwrites a destination collision', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-task-plan-archive-'));
  try {
    mkdirSync(join(root, 'plan'), { recursive: true });
    writeFileSync(join(root, 'plan/task.md'), '# Active\n');
    const binding = planBindingFor('plan/task.md', root);
    const archived = archivePlan(binding, root);

    assert.equal(archived.status, 'archived');
    assert.equal(existsSync(join(root, 'plan/task.md')), false);
    assert.equal(readFileSync(join(root, 'plan/done/task.md'), 'utf8'), '# Active\n');
    assert.equal(archivePlan(binding, root).status, 'archived');

    writeFileSync(join(root, 'plan/task.md'), '# Replacement\n');
    const collision = archivePlan(binding, root);
    assert.equal(collision.status, 'failed');
    assert.match(collision.diagnostic, /refusing to overwrite/);
    assert.equal(readFileSync(join(root, 'plan/done/task.md'), 'utf8'), '# Active\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
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
    publishPathsFor(
      [SOURCE, '.agent-state/task.json', '.agent-state/task.receipt.json'],
      [DOC],
      ['docs/context/map/backend.md', SOURCE, '.agent-state/automation/generated.json'],
    ),
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
    publishPathsFor(
      [SOURCE, 'repair/repair-12345678.md', 'plan/task.md'],
      [DOC, 'plan/done/task.md'],
      ['repair/map-note.md'],
    ),
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
  const run = args => spawnSync(process.execPath, ['scripts/task-close.mjs', ...args], {
    cwd: process.cwd(),
    env: Object.fromEntries(Object.entries({ ...process.env, TASK_CLOSE_ROOT: root, CODEX_SESSION_ID: '', CODEX_THREAD_ID: '' }).filter(([key]) => key !== 'NODE_TEST_CONTEXT')),
    encoding: 'utf8',
  });

  try {
    const prepared = run(['prepare', '--task', 'Contract wording', '--path', 'AGENTS.md']);
    assert.equal(prepared.status, 0, prepared.stderr);
    const manifest = JSON.parse(prepared.stdout).manifest;
    assert.match(manifest, /^\.agent-state\/automation\/task-close\/[0-9a-f-]+\.json$/);
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

test('CLI prepare assigns distinct canonical manifests and rejects new legacy locations', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-task-close-canonical-'));
  const run = args => spawnSync(process.execPath, ['scripts/task-close.mjs', ...args], {
    cwd: process.cwd(),
    env: Object.fromEntries(Object.entries({ ...process.env, TASK_CLOSE_ROOT: root, CODEX_SESSION_ID: '', CODEX_THREAD_ID: '' }).filter(([key]) => key !== 'NODE_TEST_CONTEXT')),
    encoding: 'utf8',
  });

  try {
    const first = run(['prepare', '--task', 'First canonical task', '--path', 'AGENTS.md']);
    const second = run(['prepare', '--task', 'Second canonical task', '--path', 'AGENTS.md']);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    const firstPath = JSON.parse(first.stdout).manifest;
    const secondPath = JSON.parse(second.stdout).manifest;
    assert.match(firstPath, /^\.agent-state\/automation\/task-close\//);
    assert.match(secondPath, /^\.agent-state\/automation\/task-close\//);
    assert.notEqual(firstPath, secondPath);
    assert.equal(existsSync(join(root, firstPath)), true);
    assert.equal(existsSync(join(root, secondPath)), true);

    const legacy = run(['prepare', '--task', 'Rejected legacy task', '--output', '.agent-state/legacy.json', '--path', 'AGENTS.md']);
    assert.equal(legacy.status, 2);
    assert.match(legacy.stderr, /new manifests must be under \.agent-state\/automation\/task-close\//);

    const explicitPath = '.agent-state/automation/task-close/explicit.json';
    const explicit = run(['prepare', '--task', 'Explicit canonical task', '--output', explicitPath, '--path', 'AGENTS.md']);
    const collision = run(['prepare', '--task', 'Colliding canonical task', '--output', explicitPath, '--path', 'AGENTS.md']);
    assert.equal(explicit.status, 0, explicit.stderr);
    assert.equal(collision.status, 1);
    assert.match(collision.stderr, /manifest already exists/);

    const publicManifest = 'public-manifest.json';
    writeFileSync(join(root, publicManifest), `${JSON.stringify(createManifest({ task: 'Public state rejected', ownedPaths: ['AGENTS.md'] }), null, 2)}\n`);
    const publicReview = run(['review', '--manifest', publicManifest, '--changed', 'AGENTS.md']);
    assert.equal(publicReview.status, 1);
    assert.match(publicReview.stderr, /schema-v2 manifests must stay under \.agent-state\//);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CLI review directs source-changing closeout through the documentation gate', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-task-close-source-'));
  const run = args => spawnSync(process.execPath, ['scripts/task-close.mjs', ...args], {
    cwd: process.cwd(),
    env: Object.fromEntries(Object.entries({ ...process.env, TASK_CLOSE_ROOT: root, CODEX_SESSION_ID: '', CODEX_THREAD_ID: '' }).filter(([key]) => key !== 'NODE_TEST_CONTEXT')),
    encoding: 'utf8',
  });

  try {
    const prepared = run(['prepare', '--task', 'Source contract', '--path', SOURCE]);
    assert.equal(prepared.status, 0, prepared.stderr);
    const manifest = JSON.parse(prepared.stdout).manifest;
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

test('closeout leaves canonical skill mirroring to the commit hook', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-task-close-skills-'));
  const manifestPath = '.agent-state/skills.json';
  const canonicalPath = '.agents/skills/example/SKILL.md';
  const mirrorPath = '.claude/skills/example/SKILL.md';
  mkdirSync(join(root, '.agents/skills/example'), { recursive: true });
  mkdirSync(join(root, '.claude/skills/example'), { recursive: true });
  mkdirSync(join(root, '.agent-state'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, canonicalPath), 'canonical skill\n');
  writeFileSync(join(root, mirrorPath), 'stale mirror\n');
  writeFileSync(join(root, 'scripts/qa-gate.mjs'), "console.log('PASS — fixture QA');\n");
  writeFileSync(join(root, 'scripts/sync-agent-skills.mjs'), "import { writeFileSync } from 'node:fs'; writeFileSync('task-close-ran-skill-sync', 'unexpected\\n');\n");
  writeFileSync(join(root, 'scripts/validate-agent-config.mjs'), "console.log('PASS — fixture agent config');\n");
  const git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(git(['init', '-q']).status, 0);
  assert.equal(git(['config', 'user.name', 'QA Fixture']).status, 0);
  assert.equal(git(['config', 'user.email', 'qa-fixture@example.invalid']).status, 0);
  assert.equal(git(['add', '.']).status, 0);
  assert.equal(git(['commit', '-qm', 'Fixture baseline']).status, 0);
  const prepared = createManifest({ task: 'Synchronize canonical skill', ownedPaths: [canonicalPath], root });
  const reviewed = reviewManifest(prepared, { changedPaths: [canonicalPath], mapBaseline: {} });
  writeFileSync(join(root, manifestPath), `${JSON.stringify(reviewed, null, 2)}\n`);
  const result = spawnSync(process.execPath, [TASK_CLOSE, 'close', '--manifest', manifestPath, '--coverage', 'none'], {
    cwd: process.cwd(),
    env: Object.fromEntries(Object.entries({ ...process.env, TASK_CLOSE_ROOT: root, CODEX_SESSION_ID: '', CODEX_THREAD_ID: '' }).filter(([key]) => key !== 'NODE_TEST_CONTEXT')),
    encoding: 'utf8',
  });

  try {
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf8'));
    const receipt = JSON.parse(readFileSync(join(root, '.agent-state/skills.receipt.json'), 'utf8'));
    assert.equal(readFileSync(join(root, mirrorPath), 'utf8'), 'stale mirror\n');
    assert.deepEqual(manifest.derived_paths, []);
    assert.equal(manifest.publish_paths.includes(mirrorPath), false);
    assert.equal(receipt.steps.some(step => step.name === 'agent skill mirror'), false);
    assert.equal(existsSync(join(root, 'task-close-ran-skill-sync')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('compaction-required game-KB failure stays open and exposes its target in compact evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-task-close-compaction-'));
  const manifestPath = '.agent-state/compaction.json';
  const sourcePath = 'src/Server/app/example.js';
  mkdirSync(join(root, 'src/Server/app'), { recursive: true });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, '.agent-state'), { recursive: true });
  mkdirSync(join(root, 'plan'), { recursive: true });
  writeFileSync(join(root, sourcePath), 'export const example = true;\n');
  writeFileSync(join(root, 'plan/task.md'), '# Active compaction task\n');
  writeFileSync(join(root, 'scripts/qa-gate.mjs'), "console.log('PASS — fixture QA');\n");
  writeFileSync(join(root, 'scripts/build-file-map.mjs'), "console.log('PASS — fixture map');\n");
  writeFileSync(join(root, 'scripts/validate-docs.mjs'), `
    if (!process.argv.includes('--quiet')) process.exit(2);
    console.log('ACTIONABLE_BLOCKER: compaction-required: automation.md section "Automated close-out" ~1700 tok > hard limit 1600 — compact this section and retry');
    console.log('FAILURE_CLASSIFICATION: implementation');
    console.log('FAIL');
    process.exitCode = 1;
  `);
  const prepared = createManifest({
    task: 'Keep hard compaction open',
    ownedPaths: [sourcePath],
    planPath: 'plan/task.md',
    root,
  });
  const reviewed = reviewManifest(prepared, { changedPaths: [sourcePath], mapBaseline: {} });
  writeFileSync(join(root, manifestPath), `${JSON.stringify(reviewed, null, 2)}\n`);
  const result = spawnSync(process.execPath, [
    TASK_CLOSE,
    'close',
    '--manifest', manifestPath,
    '--decision', 'not-needed',
    '--reason', 'The fixture changes no durable documentation contract.',
    '--coverage', 'reused',
  ], {
    cwd: process.cwd(),
    env: Object.fromEntries(Object.entries({ ...process.env, TASK_CLOSE_ROOT: root, CODEX_SESSION_ID: '', CODEX_THREAD_ID: '' }).filter(([key]) => key !== 'NODE_TEST_CONTEXT')),
    encoding: 'utf8',
  });

  try {
    assert.equal(result.status, 1);
    const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf8'));
    const receipt = JSON.parse(readFileSync(join(root, '.agent-state/compaction.receipt.json'), 'utf8'));
    const gameKb = receipt.steps.find(step => step.name === 'game KB');
    assert.equal(manifest.phase, 'failed');
    assert.deepEqual(manifest.lifecycle, { status: 'open' });
    assert.equal(manifest.plan.status, 'pending');
    assert.equal(existsSync(join(root, 'plan/task.md')), true);
    assert.equal(existsSync(join(root, 'plan/done/task.md')), false);
    assert.ok(gameKb.command.includes('--quiet'));
    assert.match(gameKb.summary, /ACTIONABLE_BLOCKER: compaction-required: automation\.md section/);
    assert.match(gameKb.summary, /FAILURE_CLASSIFICATION: implementation/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function terminalCloseFixture(qaSource, task = 'Public QA receipt fixture', { plan = false, blockArchive = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'corp-task-close-terminal-'));
  const manifestPath = '.agent-state/close.json';
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, '.agent-state'), { recursive: true });
  writeFileSync(join(root, 'README.md'), 'fixture scope\n');
  writeFileSync(join(root, 'scripts/qa-gate.mjs'), qaSource);
  if (plan) {
    mkdirSync(join(root, 'plan'), { recursive: true });
    writeFileSync(join(root, 'plan/task.md'), '# Active task plan\n');
  }
  const git = args => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(git(['init', '-q']).status, 0);
  assert.equal(git(['config', 'user.name', 'QA Fixture']).status, 0);
  assert.equal(git(['config', 'user.email', 'qa-fixture@example.invalid']).status, 0);
  assert.equal(git(['add', 'README.md', 'scripts/qa-gate.mjs']).status, 0);
  assert.equal(git(['commit', '-qm', 'Fixture baseline']).status, 0);
  const prepared = createManifest({
    task,
    ownedPaths: ['README.md'],
    runId: 'public-receipt-fixture',
    planPath: plan ? 'plan/task.md' : null,
    root,
  });
  const reviewed = reviewManifest(prepared, { changedPaths: ['README.md'], mapBaseline: {} });
  writeFileSync(join(root, manifestPath), `${JSON.stringify(reviewed, null, 2)}\n`);
  if (blockArchive) writeFileSync(join(root, 'plan/done'), 'archive parent blocker\n');
  const run = () => spawnSync(process.execPath, [TASK_CLOSE, 'close', '--manifest', manifestPath, '--coverage', 'none'], {
    cwd: process.cwd(),
    env: Object.fromEntries(Object.entries({
      ...process.env,
      TASK_CLOSE_ROOT: root,
      CODEX_SESSION_ID: '',
      CODEX_THREAD_ID: '',
    }).filter(([key]) => key !== 'NODE_TEST_CONTEXT')),
    encoding: 'utf8',
  });
  return {
    root,
    manifestPath,
    run,
    activePlan: join(root, 'plan/task.md'),
    archivedPlan: join(root, 'plan/done/task.md'),
  };
}

test('a legacy schema-v2 manifest can close while its raw receipt remains private', () => {
  const fixture = terminalCloseFixture("console.log('PASS — fixture QA');\n");
  try {
    const first = fixture.run();
    assert.equal(first.status, 0, first.stderr);
    const manifest = JSON.parse(readFileSync(join(fixture.root, fixture.manifestPath), 'utf8'));
    assert.equal(manifest.phase, 'closed');
    assert.equal(manifest.verification.status, 'passed');
    assert.equal(manifest.task_identity.label, 'Public QA Receipt v0.01');
    assert.equal(manifest.verification.public_receipt, 'report/qa-receipts/qa-receipt-public-qa-receipt-v0.01.md');
    assert.ok(manifest.publish_paths.includes(manifest.verification.public_receipt));
    assert.equal(manifest.verification.receipt, '.agent-state/close.receipt.json');
    assert.equal(manifest.publish_paths.some(path => path.startsWith('.agent-state/')), false);
    assert.equal(existsSync(join(fixture.root, '.agent-state/close.receipt.json')), true);
    assert.match(readFileSync(join(fixture.root, manifest.verification.public_receipt), 'utf8'), /Verification: PASSED/);

    const repeated = fixture.run();
    assert.equal(repeated.status, 0, repeated.stderr);
    assert.equal(JSON.parse(readFileSync(join(fixture.root, fixture.manifestPath), 'utf8')).phase, 'closed');
    assert.deepEqual(readdirSync(join(fixture.root, 'report/qa-receipts')), ['qa-receipt-public-qa-receipt-v0.01.md']);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('passed close archives a bound plan and records the closed lifecycle', () => {
  const fixture = terminalCloseFixture("console.log('PASS — fixture QA');\n", 'Bound plan receipt fixture', { plan: true });
  try {
    const result = fixture.run();
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(readFileSync(join(fixture.root, fixture.manifestPath), 'utf8'));
    const privateReceipt = JSON.parse(readFileSync(join(fixture.root, '.agent-state/close.receipt.json'), 'utf8'));
    const publicReceipt = readFileSync(join(fixture.root, manifest.verification.public_receipt), 'utf8');

    assert.equal(existsSync(fixture.activePlan), false);
    assert.equal(readFileSync(fixture.archivedPlan, 'utf8'), '# Active task plan\n');
    assert.deepEqual(manifest.lifecycle, { status: 'closed' });
    assert.equal(manifest.plan.status, 'archived');
    assert.equal(privateReceipt.plan.status, 'archived');
    assert.match(publicReceipt, /Task closure: CLOSED/);
    assert.match(publicReceipt, /Plan archive: ARCHIVED/);
    assert.match(publicReceipt, /Active plan: plan\/task\.md/);
    assert.match(publicReceipt, /Archived plan: plan\/done\/task\.md/);
    assert.equal(manifest.publish_paths.some(path => path.startsWith('plan/')), false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('terminal maintenance-blocked close publishes completed implementation evidence', () => {
  const fixture = terminalCloseFixture(`
    console.error('FAILURE_CLASSIFICATION: tooling-environment');
    console.error('FAIL — fixture executable unavailable');
    process.exit(1);
  `, 'Maintenance plan receipt fixture', { plan: true });
  try {
    const result = fixture.run();
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(readFileSync(join(fixture.root, fixture.manifestPath), 'utf8'));
    assert.equal(manifest.phase, 'closed');
    assert.equal(manifest.verification.status, 'maintenance-blocked');
    assert.ok(manifest.publish_paths.includes(manifest.verification.public_receipt));
    const receipt = readFileSync(join(fixture.root, manifest.verification.public_receipt), 'utf8');
    assert.match(receipt, /Implementation: COMPLETED/);
    assert.match(receipt, /Verification: MAINTENANCE-BLOCKED/);
    assert.match(receipt, /Failure classification: tooling-environment/);
    assert.match(receipt, /fixture executable unavailable/);
    assert.equal(manifest.plan.status, 'archived');
    assert.equal(existsSync(fixture.activePlan), false);
    assert.equal(existsSync(fixture.archivedPlan), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('implementation-failed close remains open and writes no public receipt', () => {
  const fixture = terminalCloseFixture(`
    console.error('FAILURE_CLASSIFICATION: implementation');
    console.error('FAIL — fixture assertion failed');
    process.exit(1);
  `, 'Failed plan receipt fixture', { plan: true });
  try {
    const result = fixture.run();
    assert.equal(result.status, 1);
    const manifest = JSON.parse(readFileSync(join(fixture.root, fixture.manifestPath), 'utf8'));
    assert.equal(manifest.phase, 'failed');
    assert.equal(manifest.verification.status, 'failed');
    assert.equal(manifest.verification.public_receipt, null);
    assert.equal(manifest.task_identity, null);
    assert.equal(existsSync(join(fixture.root, 'report/qa-receipts')), false);
    assert.equal(existsSync(join(fixture.root, '.agent-state/close.receipt.json')), true);
    assert.equal(manifest.plan.status, 'pending');
    assert.equal(existsSync(fixture.activePlan), true);
    assert.equal(existsSync(fixture.archivedPlan), false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('destination collision blocks closure without overwriting either plan', () => {
  const fixture = terminalCloseFixture("console.log('PASS — fixture QA');\n", 'Collision plan fixture', { plan: true });
  try {
    mkdirSync(join(fixture.root, 'plan/done'), { recursive: true });
    writeFileSync(fixture.archivedPlan, '# Existing archive\n');
    const result = fixture.run();
    const manifest = JSON.parse(readFileSync(join(fixture.root, fixture.manifestPath), 'utf8'));

    assert.equal(result.status, 1);
    assert.equal(manifest.phase, 'closure-blocked');
    assert.equal(manifest.verification.status, 'passed');
    assert.equal(manifest.lifecycle.status, 'blocked');
    assert.equal(readFileSync(fixture.activePlan, 'utf8'), '# Active task plan\n');
    assert.equal(readFileSync(fixture.archivedPlan, 'utf8'), '# Existing archive\n');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('archive failure preserves verification and retries closure without rerunning QA', () => {
  const fixture = terminalCloseFixture(`
    import { appendFileSync } from 'node:fs';
    appendFileSync('qa-runs.txt', 'run\\n');
    console.log('PASS — fixture QA');
  `, 'Retry plan fixture', { plan: true, blockArchive: true });
  try {
    const first = fixture.run();
    let manifest = JSON.parse(readFileSync(join(fixture.root, fixture.manifestPath), 'utf8'));
    const blockedReceipt = readFileSync(join(fixture.root, manifest.verification.public_receipt), 'utf8');

    assert.equal(first.status, 1);
    assert.equal(manifest.phase, 'closure-blocked');
    assert.equal(manifest.verification.status, 'passed');
    assert.equal(manifest.publish_paths.length, 0);
    assert.match(blockedReceipt, /Task closure: BLOCKED/);
    assert.match(blockedReceipt, /Plan archive: FAILED/);
    assert.equal(readFileSync(join(fixture.root, 'qa-runs.txt'), 'utf8'), 'run\n');

    rmSync(join(fixture.root, 'plan/done'));
    const retried = fixture.run();
    manifest = JSON.parse(readFileSync(join(fixture.root, fixture.manifestPath), 'utf8'));

    assert.equal(retried.status, 0, retried.stderr);
    assert.equal(manifest.phase, 'closed');
    assert.equal(manifest.plan.status, 'archived');
    assert.equal(readFileSync(join(fixture.root, 'qa-runs.txt'), 'utf8'), 'run\n');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('retry recognizes an already-moved archive after partial closure', () => {
  const fixture = terminalCloseFixture(`
    import { appendFileSync } from 'node:fs';
    appendFileSync('qa-runs.txt', 'run\\n');
    console.log('PASS — fixture QA');
  `, 'Partial archive fixture', { plan: true, blockArchive: true });
  try {
    assert.equal(fixture.run().status, 1);
    rmSync(join(fixture.root, 'plan/done'));
    mkdirSync(join(fixture.root, 'plan/done'), { recursive: true });
    renameSync(fixture.activePlan, fixture.archivedPlan);

    const retried = fixture.run();
    const manifest = JSON.parse(readFileSync(join(fixture.root, fixture.manifestPath), 'utf8'));
    assert.equal(retried.status, 0, retried.stderr);
    assert.equal(manifest.phase, 'closed');
    assert.equal(manifest.plan.status, 'archived');
    assert.equal(readFileSync(join(fixture.root, 'qa-runs.txt'), 'utf8'), 'run\n');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
