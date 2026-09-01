export const PROSE_BUDGETS = {
  'automation.md': 3200,
  'backend.md': 3600,
  'build.md': 1250,
  'deployment-backup.md': 1950,
  'deployment-eks.md': 1450,
  'deployment.md': 1650,
  'gameplay.md': 2650,
  'index.md': 1900,
  'networking.md': 2200,
  'testing.md': 1700,
  'ui-hud.md': 2450,
  'ui-tutorial.md': 1050,
  'ui.md': 1350,
};

export const PROSE_TOTAL_BUDGET = 26150;
export const DEFAULT_PROSE_BUDGET = 1500;
export const CAPACITY_HARD_MULTIPLIER = 1.25;
export const PROSE_TOTAL_HARD_CEILING = roundUpTo(PROSE_TOTAL_BUDGET * CAPACITY_HARD_MULTIPLIER);
export const PROSE_SECTION_WARNING = 1000;
export const PROSE_SECTION_HARD_LIMIT = 1600;

export const MAP_CAPACITY_BASELINES = {
  'backend.md': { budget: 5700, file_count: 25, average_tokens_per_file: 228 },
  'infra.md': { budget: 14000, file_count: 115, average_tokens_per_file: 122 },
  'ui-debug.md': { budget: 1650, file_count: 5, average_tokens_per_file: 330 },
  'ui-hud.md': { budget: 8000, file_count: 38, average_tokens_per_file: 211 },
  'ui-screens.md': { budget: 4600, file_count: 24, average_tokens_per_file: 192 },
  'ui-tutorial.md': { budget: 1750, file_count: 7, average_tokens_per_file: 250 },
};

export const DEFAULT_MAP_BUDGET = 1500;
export const MAP_TOTAL_BASELINE = 35600;

export function roundUpTo(value, unit = 50) {
  return Math.ceil(value / unit) * unit;
}

export function proseRebaseline(snapshotTokens, currentBudget) {
  if (!Number.isFinite(snapshotTokens) || snapshotTokens < 0) throw new Error('snapshot tokens must be non-negative');
  if (!Number.isFinite(currentBudget) || currentBudget < 0) throw new Error('current prose budget must be non-negative');
  const headroom = Math.max(snapshotTokens * 0.2, 200);
  return Math.max(currentBudget, roundUpTo(snapshotTokens + headroom));
}

export function capacityStatus(tokens, softCapacity, hardCeiling) {
  if (!Number.isFinite(tokens) || tokens < 0) throw new Error('capacity tokens must be non-negative');
  if (!Number.isFinite(softCapacity) || softCapacity < 0) throw new Error('soft capacity must be non-negative');
  if (!Number.isFinite(hardCeiling) || hardCeiling < softCapacity) throw new Error('hard ceiling must be at least the soft capacity');
  if (tokens > hardCeiling) return 'hard-overage';
  if (tokens > softCapacity) return 'soft-overage';
  return 'healthy';
}

export function proseCapacitySummary(tokens) {
  return {
    capacity: PROSE_TOTAL_BUDGET,
    hard_ceiling: PROSE_TOTAL_HARD_CEILING,
    status: capacityStatus(tokens, PROSE_TOTAL_BUDGET, PROSE_TOTAL_HARD_CEILING),
  };
}

export function proseFileCapacityStatus(tokens, softCapacity) {
  if (!Number.isFinite(tokens) || tokens < 0) throw new Error('prose tokens must be non-negative');
  if (!Number.isFinite(softCapacity) || softCapacity < 0) throw new Error('prose soft capacity must be non-negative');
  return tokens > softCapacity ? 'soft-overage' : 'healthy';
}

export function proseSectionStatus(tokens) {
  if (!Number.isFinite(tokens) || tokens < 0) throw new Error('section tokens must be non-negative');
  if (tokens > PROSE_SECTION_HARD_LIMIT) return 'hard-overage';
  if (tokens > PROSE_SECTION_WARNING) return 'warning';
  return 'healthy';
}

export function quietValidationLines({ warningCount, statusMarkerCount, blockers, classification }) {
  const lines = [`warnings: ${warningCount}   status markers: ${statusMarkerCount}   hard blockers: ${blockers.length}`];
  if (blockers.length) {
    lines.push(`ACTIONABLE_BLOCKER: ${blockers[0]}`);
    if (blockers.length > 1) lines.push(`remaining hard blockers: ${blockers.length - 1}   (re-run without --quiet for detail)`);
  }
  if (classification) lines.push(`FAILURE_CLASSIFICATION: ${classification}`);
  return lines;
}

export function mapCapacityFor(file, currentFileCount) {
  const baseline = MAP_CAPACITY_BASELINES[file];
  if (!baseline) return {
    capacity: DEFAULT_MAP_BUDGET,
    density_ceiling: roundUpTo(DEFAULT_MAP_BUDGET * CAPACITY_HARD_MULTIPLIER),
    baseline: null,
  };
  if (!Number.isInteger(currentFileCount) || currentFileCount < 0) throw new Error('current mapped file count must be a non-negative integer');
  const addedFiles = Math.max(0, currentFileCount - baseline.file_count);
  const capacity = roundUpTo(baseline.budget + addedFiles * baseline.average_tokens_per_file);
  return {
    capacity,
    density_ceiling: roundUpTo(capacity * CAPACITY_HARD_MULTIPLIER),
    baseline,
  };
}

export function mapCapacityStatus(tokens, capacity) {
  return capacityStatus(tokens, capacity.capacity, capacity.density_ceiling);
}

export function mapCapacitySummary(source) {
  const counts = new Map();
  for (const item of source) counts.set(item.area, (counts.get(item.area) || 0) + 1);
  const entries = Object.entries(MAP_CAPACITY_BASELINES).map(([file, baseline]) => {
    const area = file.replace(/\.md$/, '');
    return [file, mapCapacityFor(file, counts.get(area) || 0)];
  });
  const capacity = Math.max(MAP_TOTAL_BASELINE, entries.reduce((total, [, value]) => total + value.capacity, 0));
  return {
    by_file: Object.fromEntries(entries),
    capacity,
    density_ceiling: roundUpTo(capacity * CAPACITY_HARD_MULTIPLIER),
  };
}

export function validatorFailureClassification({ semanticErrors, maintenanceErrors }) {
  if (semanticErrors.length) return 'implementation';
  if (maintenanceErrors.length) return 'validator-maintenance';
  return null;
}
