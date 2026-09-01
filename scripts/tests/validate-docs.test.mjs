import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROSE_SECTION_HARD_LIMIT,
  PROSE_SECTION_WARNING,
  PROSE_TOTAL_BUDGET,
  PROSE_TOTAL_HARD_CEILING,
  mapCapacityFor,
  mapCapacityStatus,
  mapCapacitySummary,
  proseCapacitySummary,
  proseFileCapacityStatus,
  proseRebaseline,
  proseSectionStatus,
  quietValidationLines,
  validatorFailureClassification,
} from '../lib/docs-capacity.mjs';

test('prose capacity rebaseline preserves the larger 20 percent or 200-token allowance', () => {
  assert.equal(proseRebaseline(500, 600), 700);
  assert.equal(proseRebaseline(1001, 1000), 1250);
  assert.equal(proseRebaseline(2000, 2000), 2400);
  assert.equal(proseRebaseline(900, 1200), 1200);
  assert.equal(PROSE_TOTAL_BUDGET, 26150);
  assert.equal(PROSE_TOTAL_HARD_CEILING, 32700);
});

test('a later capacity increase remains available without an automatic compaction rule', () => {
  assert.equal(proseRebaseline(1300, 1200), 1600);
});

test('aggregate prose capacity distinguishes advisory growth from the exceptional hard ceiling', () => {
  assert.equal(proseCapacitySummary(PROSE_TOTAL_BUDGET).status, 'healthy');
  assert.equal(proseCapacitySummary(PROSE_TOTAL_BUDGET + 1).status, 'soft-overage');
  assert.equal(proseCapacitySummary(PROSE_TOTAL_HARD_CEILING + 1).status, 'hard-overage');
});

test('whole-file prose capacity is advisory while section size has a hard retrieval guard', () => {
  assert.equal(proseFileCapacityStatus(1501, 1500), 'soft-overage');
  assert.equal(proseSectionStatus(PROSE_SECTION_WARNING + 1), 'warning');
  assert.equal(proseSectionStatus(PROSE_SECTION_HARD_LIMIT + 1), 'hard-overage');
});

test('map capacity grows from the recorded file baseline and never shrinks below it', () => {
  const baseline = mapCapacityFor('backend.md', 25);
  const grown = mapCapacityFor('backend.md', 26);
  const deleted = mapCapacityFor('backend.md', 1);

  assert.equal(baseline.capacity, 5700);
  assert.equal(grown.capacity, 5950);
  assert.equal(deleted.capacity, 5700);
  assert.equal(baseline.density_ceiling, 7150);
});

test('unchanged map file counts retain the density ceiling that catches generator bloat', () => {
  const summary = mapCapacitySummary(Array.from({ length: 25 }, () => ({ area: 'backend' })));

  assert.equal(summary.by_file['backend.md'].capacity, 5700);
  assert.equal(summary.by_file['backend.md'].density_ceiling, 7150);
  assert.equal(mapCapacityStatus(7200, summary.by_file['backend.md']), 'hard-overage');
});

test('ui-screens-style growth above soft capacity remains healthy until density overflow', () => {
  const capacity = mapCapacityFor('ui-screens.md', 28);

  assert.equal(capacity.capacity, 5400);
  assert.equal(capacity.density_ceiling, 6750);
  assert.equal(mapCapacityStatus(5693, capacity), 'soft-overage');
  assert.equal(mapCapacityStatus(6751, capacity), 'hard-overage');
});

test('semantic validator failures remain task-owned while density failures remain maintenance', () => {
  assert.equal(validatorFailureClassification({ semanticErrors: ['dead anchor'], maintenanceErrors: [] }), 'implementation');
  assert.equal(validatorFailureClassification({ semanticErrors: [], maintenanceErrors: ['map density'] }), 'validator-maintenance');
  assert.equal(validatorFailureClassification({ semanticErrors: ['compaction-required'], maintenanceErrors: [] }), 'implementation');
  assert.equal(validatorFailureClassification({ semanticErrors: ['dead anchor'], maintenanceErrors: ['map density'] }), 'implementation');
});

test('quiet PASS is terse', () => {
  assert.deepEqual(quietValidationLines({
    warningCount: 2,
    statusMarkerCount: 1,
    blockers: [],
    classification: null,
  }), ['warnings: 2   status markers: 1   hard blockers: 0']);
});

test('quiet hard-section failure is terse, actionable, and task-owned', () => {
  const lines = quietValidationLines({
    warningCount: 3,
    statusMarkerCount: 0,
    blockers: [
      'compaction-required: overflow.md section "Oversized retrieval unit" ~1601 tok > hard limit 1600 — compact this section and retry',
      'dead anchor',
    ],
    classification: 'implementation',
  });

  assert.equal(lines.length, 4);
  assert.match(lines[1], /^ACTIONABLE_BLOCKER: compaction-required: overflow\.md section/);
  assert.match(lines[2], /remaining hard blockers: 1/);
  assert.equal(lines[3], 'FAILURE_CLASSIFICATION: implementation');
});
