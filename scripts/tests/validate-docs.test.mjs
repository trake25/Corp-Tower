import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mapCapacityFor,
  mapCapacitySummary,
  proseRebaseline,
  validatorFailureClassification,
} from '../lib/docs-capacity.mjs';

test('prose capacity rebaseline preserves the larger 20 percent or 200-token allowance', () => {
  assert.equal(proseRebaseline(500, 600), 700);
  assert.equal(proseRebaseline(1001, 1000), 1250);
  assert.equal(proseRebaseline(2000, 2000), 2400);
  assert.equal(proseRebaseline(900, 1200), 1200);
});

test('a later capacity increase remains available without an automatic compaction rule', () => {
  assert.equal(proseRebaseline(1300, 1200), 1600);
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
  assert.equal(7200 > summary.by_file['backend.md'].density_ceiling, true);
});

test('semantic validator failures remain task-owned while capacity failures become maintenance', () => {
  assert.equal(validatorFailureClassification({ semanticErrors: ['dead anchor'], maintenanceErrors: [] }), 'implementation');
  assert.equal(validatorFailureClassification({ semanticErrors: [], maintenanceErrors: ['capacity'] }), 'validator-maintenance');
  assert.equal(validatorFailureClassification({ semanticErrors: ['dead anchor'], maintenanceErrors: ['capacity'] }), 'implementation');
});
