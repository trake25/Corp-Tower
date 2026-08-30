export const PROSE_BUDGETS = {
  'automation.md': 2700,
  'backend.md': 3300,
  'build.md': 1250,
  'deployment-backup.md': 1950,
  'deployment-eks.md': 1450,
  'deployment.md': 1650,
  'gameplay.md': 2600,
  'index.md': 1900,
  'networking.md': 2000,
  'testing.md': 1700,
  'ui-hud.md': 2250,
  'ui-tutorial.md': 1000,
  'ui.md': 1100,
};

export const PROSE_TOTAL_BUDGET = 24400;
export const DEFAULT_PROSE_BUDGET = 1500;

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

export function mapCapacityFor(file, currentFileCount) {
  const baseline = MAP_CAPACITY_BASELINES[file];
  if (!baseline) return {
    capacity: DEFAULT_MAP_BUDGET,
    density_ceiling: roundUpTo(DEFAULT_MAP_BUDGET * 1.25),
    baseline: null,
  };
  if (!Number.isInteger(currentFileCount) || currentFileCount < 0) throw new Error('current mapped file count must be a non-negative integer');
  const addedFiles = Math.max(0, currentFileCount - baseline.file_count);
  const capacity = roundUpTo(baseline.budget + addedFiles * baseline.average_tokens_per_file);
  return {
    capacity,
    density_ceiling: roundUpTo(capacity * 1.25),
    baseline,
  };
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
    density_ceiling: roundUpTo(capacity * 1.25),
  };
}

export function validatorFailureClassification({ semanticErrors, maintenanceErrors }) {
  if (semanticErrors.length) return 'implementation';
  if (maintenanceErrors.length) return 'validator-maintenance';
  return null;
}
