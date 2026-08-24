import assert from 'node:assert/strict';
import test from 'node:test';
import { selectQa } from '../qa-gate.mjs';
import { applyDocumentationDecision, createManifest, intakeForManifest } from '../task-close.mjs';

test('QA planner preserves targeted server and client selection', () => {
  const plan = selectQa([
    'src/Server/app/engine/Scoring.js',
    'src/Client/App/corp-tower/Cor/Scripts/GameUi/SnapGrid.gd',
  ]);

  assert.equal(plan.full_server, false);
  assert.deepEqual(plan.server_tests, [
    'Gameplay_Events.test.js',
    'Placement_Geometry.test.js',
    'Stability_Scoring.test.js',
  ]);
  assert.equal(plan.client_runtime, true);
  assert.deepEqual(plan.client_tests, ['test_snap_grid.gd']);
});

test('close-out manifest derives QA, routes, documentation candidates, and maps', () => {
  const manifest = createManifest({
    task: 'Verify scoring close-out',
    changedPaths: ['src/Server/app/engine/Scoring.js'],
  });

  assert.equal(manifest.schema_version, 1);
  assert.deepEqual(manifest.domains, ['server']);
  assert.equal(manifest.qa.full_server, false);
  assert.equal(manifest.qa.server_tests.length, 3);
  assert.deepEqual(manifest.documentation.candidate_docs, ['backend.md']);
  assert.deepEqual(manifest.documentation.maps_to_regenerate, ['docs/context/map/backend.md']);
  assert.equal(manifest.documentation.decision, 'pending');

  const intake = intakeForManifest(manifest, 'task/close-out.json');
  assert.equal(intake.manifest, 'task/close-out.json');
  assert.deepEqual(intake.intake.routes, manifest.routes);
  assert.deepEqual(intake.intake.qa, manifest.qa);
  assert.deepEqual(intake.intake.documentation.candidate_docs, ['backend.md']);
  assert.equal(intake.intake.documentation.scope, null);
});

test('documentation decisions require an agent rationale and a concrete doc after an update', () => {
  const manifest = createManifest({
    task: 'Verify scoring close-out',
    changedPaths: ['src/Server/app/engine/Scoring.js'],
  });

  assert.throws(() => applyDocumentationDecision(manifest, {
    decision: 'updated',
    reason: 'Scoring behavior changed.',
  }), /doc-path/);
  assert.throws(() => applyDocumentationDecision(manifest, {
    decision: 'not-needed',
    reason: '',
  }), /plain-English reason/);

  const updated = applyDocumentationDecision(manifest, {
    decision: 'updated',
    reason: 'Scoring behavior changed.',
    documentedPaths: ['docs/context/backend.md'],
  });
  assert.equal(updated.documentation.decision, 'updated');
  assert.deepEqual(updated.documentation.documented_paths, ['docs/context/backend.md']);
});

test('a documentation-only manifest does not request an unnecessary source decision', () => {
  const manifest = createManifest({
    task: 'Validate documentation only',
    changedPaths: ['docs/context/testing.md'],
  });

  assert.equal(manifest.documentation.source_changed, false);
  assert.equal(manifest.documentation.decision, 'not-needed');
});
