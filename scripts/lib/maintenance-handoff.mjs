import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const FAILURE_CLASSIFICATIONS = new Set([
  'implementation',
  'test-expectation',
  'tooling-environment',
  'validator-maintenance',
  'retrieval-map-maintenance',
  'qa-infrastructure',
]);

export const MAINTENANCE_CLASSIFICATIONS = new Set([
  'test-expectation',
  'tooling-environment',
  'validator-maintenance',
  'retrieval-map-maintenance',
  'qa-infrastructure',
  'architecture-decomposition',
]);

export const FAILURE_CLASSIFICATION_PREFIX = 'FAILURE_CLASSIFICATION: ';

const collapse = value => String(value || '').replace(/\s+/g, ' ').trim();
const compact = (value, maximum) => {
  const text = collapse(value);
  if (!text) return 'No compact diagnostic was available.';
  return text.length <= maximum ? text : `${text.slice(0, Math.max(1, maximum - 1)).trimEnd()}…`;
};

function requiredText(value, label, maximum) {
  const text = compact(value, maximum);
  if (text === 'No compact diagnostic was available.') throw new Error(`${label} is required`);
  return text;
}

function normalizedPath(path) {
  return String(path || '').replaceAll('\\', '/').replace(/^(?:\.\/)+/, '');
}

export function isMaintenancePath(path) {
  return normalizedPath(path).startsWith('repair/');
}

export function failureClassificationLine(classification) {
  if (!FAILURE_CLASSIFICATIONS.has(classification)) throw new Error(`unknown failure classification: ${classification}`);
  return `${FAILURE_CLASSIFICATION_PREFIX}${classification}`;
}

export function failureClassificationFromOutput(output) {
  const classifications = String(output || '').split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith(FAILURE_CLASSIFICATION_PREFIX))
    .map(line => line.slice(FAILURE_CLASSIFICATION_PREFIX.length).trim())
    .filter(classification => FAILURE_CLASSIFICATIONS.has(classification));
  return classifications.at(-1) || null;
}

export function isMaintenanceClassification(classification) {
  return MAINTENANCE_CLASSIFICATIONS.has(classification);
}

export function terminalStatusForSteps(steps) {
  const failures = steps.filter(step => step.status !== 0);
  if (!failures.length) return 'passed';
  return failures.every(step => isMaintenanceClassification(step.classification))
    ? 'maintenance-blocked'
    : 'failed';
}

export function maintenanceTaskSlug(task) {
  const slug = String(task || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || 'maintenance';
}

export function maintenanceRunId(runId) {
  const short = String(runId || '').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  if (!short) throw new Error('run ID must contain at least one letter or digit');
  return short;
}

export function maintenanceHandoffPath(root, { task, runId }) {
  return join(resolve(root), 'repair', `${maintenanceTaskSlug(task)}-${maintenanceRunId(runId)}.md`);
}

export function createMaintenanceItem({
  state,
  classification,
  stage,
  affected,
  diagnostic,
  verificationImpact,
  completed,
  recommendedFollowUp,
}) {
  if (!['blocking', 'advisory'].includes(state)) throw new Error('maintenance state must be blocking or advisory');
  if (!MAINTENANCE_CLASSIFICATIONS.has(classification)) throw new Error(`maintenance classification is not allowed: ${classification}`);
  return {
    state,
    classification,
    stage: requiredText(stage, 'maintenance stage', 120),
    affected: requiredText(affected, 'maintenance affected path or tool', 180),
    diagnostic: requiredText(diagnostic, 'maintenance diagnostic', 280),
    verification_impact: requiredText(verificationImpact, 'maintenance verification impact', 180),
    completed: requiredText(completed, 'maintenance completed work', 220),
    recommended_follow_up: requiredText(recommendedFollowUp, 'maintenance recommended follow-up', 220),
  };
}

function followUpFor(classification, step) {
  if (classification === 'tooling-environment') return `Restore the required host capability, then rerun ${step.name}.`;
  if (classification === 'test-expectation') return `Confirm the expectation against source history, then repair or rerun ${step.name}.`;
  if (classification === 'validator-maintenance') return `Schedule the validator capacity work, then rerun ${step.name}.`;
  return `Repair the retrieval or map maintenance issue, then rerun ${step.name}.`;
}

export function maintenanceItemsForSteps(steps) {
  return steps.filter(step => step.status !== 0 && isMaintenanceClassification(step.classification)).map(step =>
    createMaintenanceItem({
      state: 'blocking',
      classification: step.classification,
      stage: step.name,
      affected: step.command?.length ? step.command.join(' ') : step.name,
      diagnostic: step.summary,
      verificationImpact: `${step.name} could not provide required proof.`,
      completed: 'The planned implementation completed before this unrelated verification blocker.',
      recommendedFollowUp: followUpFor(step.classification, step),
    }));
}

export function isArchitectureCandidate(path) {
  const normalized = normalizedPath(path);
  if (!/^(?:src\/|site\/src\/)/.test(normalized)) return false;
  if (/^(?:src\/Server\/tests\/|src\/Client\/.*\/Tests\/|site\/src\/content\/)/.test(normalized)) return false;
  if (/(?:^|\/)(?:generated|dist|build|docs|map)(?:\/|$)/.test(normalized)) return false;
  return /\.(?:astro|cjs|css|gd|js|jsx|mjs|ts|tsx)$/.test(normalized);
}

export function architectureMaintenanceItems(paths, root) {
  const base = resolve(root);
  const items = [];
  for (const path of [...new Set(paths.map(normalizedPath))].sort()) {
    if (!isArchitectureCandidate(path)) continue;
    const absolute = resolve(base, path);
    if (!absolute.startsWith(`${base}/`) || !existsSync(absolute)) continue;
    const lines = readFileSync(absolute, 'utf8').split(/\r?\n/).length - 1;
    if (lines < 900) continue;
    const strong = lines >= 1200;
    items.push(createMaintenanceItem({
      state: 'advisory',
      classification: 'architecture-decomposition',
      stage: strong ? 'strong decomposition candidate' : 'decomposition review candidate',
      affected: path,
      diagnostic: `${path} is ${lines} lines; the advisory threshold is ${strong ? '~1200' : '~900'} lines.`,
      verificationImpact: 'Advisory only; verification remains valid.',
      completed: 'The current task stayed scoped and did not refactor the file.',
      recommendedFollowUp: strong
        ? 'Plan a focused decomposition before the next feature expands this file.'
        : 'Review cohesion before the next feature expands this file.',
    }));
  }
  return items;
}

function renderItem(item) {
  return [
    `### ${item.classification} — ${item.stage}`,
    '',
    `- Affected path or tool: ${item.affected}`,
    `- Diagnostic / impact: ${item.diagnostic} ${item.verification_impact}`,
    `- Completed: ${item.completed}`,
    `- Follow-up: ${item.recommended_follow_up}`,
  ].join('\n');
}

export function writeMaintenanceHandoff(root, { task, runId, items }) {
  if (!items.length) return null;
  const absolute = maintenanceHandoffPath(root, { task, runId });
  const blocking = items.filter(item => item.state === 'blocking');
  const advisory = items.filter(item => item.state === 'advisory');
  const sections = [
    `# Maintenance handoff — ${compact(task, 120)}`,
    '',
    `Run: \`${maintenanceRunId(runId)}\``,
  ];
  if (blocking.length) sections.push('', '## Blocking', '', ...blocking.map(renderItem));
  if (advisory.length) sections.push('', '## Advisory', '', ...advisory.map(renderItem));
  mkdirSync(join(resolve(root), 'repair'), { recursive: true });
  writeFileSync(absolute, `${sections.join('\n')}\n`);
  return relative(resolve(root), absolute).replaceAll('\\', '/');
}

export function resolveMaintenanceHandoff({ root, task, runId, steps, changedPaths, advisoryItems = [] }) {
  const blocking = maintenanceItemsForSteps(steps);
  const advisory = [...architectureMaintenanceItems(changedPaths, root), ...advisoryItems];
  const items = [...blocking, ...advisory];
  return {
    status: terminalStatusForSteps(steps),
    items,
    handoff: writeMaintenanceHandoff(root, { task, runId, items }),
  };
}
