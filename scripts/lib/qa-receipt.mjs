import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { terminalStatusForSteps } from './maintenance-handoff.mjs';
import { validateTaskIdentity } from './task-identity.mjs';

function sanitized(value, fallback = 'Not recorded.') {
  let text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return fallback;
  text = text
    .replace(/(?:file:\/\/)?\/(?:home|Users)\/[^/\s`)]+(?:\/[^\s`)]+)*/gi, '[private path]')
    .replace(/(?:file:\/\/)?\/root(?:\/[^\s`)]+)*/gi, '[private path]')
    .replace(/(?:file:\/\/\/?)?[A-Z]:[\\/]Users[\\/][^\\/\s`)]+(?:[\\/][^\s`)]+)*/gi, '[private path]')
    .replace(/(?:file:\/\/)?(?:\/tmp|\.agent-state)[/\\][^\s`)]+/gi, '[private path]')
    .replace(/\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY)[A-Z0-9_]*)\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/gi, '$1=[redacted]')
    .replace(/([\\`*[\]<>])/g, '\\$1')
    .replace(/\\\[(private path|redacted)\\\]/g, '[$1]');
  return text;
}

function pathLines(paths) {
  const selected = [...new Set((paths || []).filter(Boolean))].sort();
  return selected.length ? selected.map(path => `- ${sanitized(path)}`) : ['- None.'];
}

function maintenanceItemLines(item) {
  return [
    `#### ${sanitized(item.stage)} — ${sanitized(item.classification)}`,
    '',
    `- Affected component or tool: ${sanitized(item.affected)}`,
    `- Diagnostic / impact: ${sanitized(item.diagnostic)} ${sanitized(item.verification_impact)}`,
    `- Follow-up: ${sanitized(item.recommended_follow_up)}`,
  ];
}

function maintenanceLines(items) {
  const blocking = items.filter(item => item.state === 'blocking');
  const advisory = items.filter(item => item.state === 'advisory');
  const lines = [];
  if (blocking.length) {
    lines.push('### Blocking', '');
    blocking.forEach((item, index) => {
      if (index) lines.push('');
      lines.push(...maintenanceItemLines(item));
    });
  }
  if (advisory.length) {
    if (lines.length) lines.push('');
    lines.push('### Advisory', '');
    advisory.forEach((item, index) => {
      if (index) lines.push('');
      lines.push(...maintenanceItemLines(item));
    });
  }
  return lines.length ? lines : ['- None.'];
}

export function publicQaReceiptPath(identity) {
  const valid = validateTaskIdentity(identity);
  return `report/qa-receipts/qa-receipt-${valid.slug}-v${valid.version}.md`;
}

export function renderPublicQaReceipt({
  identity,
  task,
  verificationStatus,
  lifecycle = { status: 'closed' },
  plan = { status: 'not-applicable', source_path: null, archive_path: null },
  changedPaths = [],
  publishPaths = [],
  steps = [],
  coverage = {},
  qa = {},
  maintenanceItems = [],
}) {
  const validIdentity = validateTaskIdentity(identity, task);
  if (!['passed', 'maintenance-blocked'].includes(verificationStatus))
    throw new Error('public QA receipts require passed or maintenance-blocked verification');
  if (terminalStatusForSteps(steps) !== verificationStatus)
    throw new Error('public QA receipt status does not match its executable proof');
  const verificationLabel = verificationStatus === 'passed' ? 'PASSED' : 'MAINTENANCE-BLOCKED';
  if (!['closed', 'blocked'].includes(lifecycle.status))
    throw new Error('public QA receipts require a closed or blocked task lifecycle');
  const closureLabel = lifecycle.status === 'closed' ? 'CLOSED' : 'BLOCKED';
  const planLabel = String(plan.status || 'not-applicable').replaceAll('-', ' ').toUpperCase();
  const lines = [
    `# QA receipt — ${sanitized(validIdentity.label)}`,
    '',
    `- Original task: ${sanitized(task)}`,
    `- Task identity: ${sanitized(validIdentity.label)}`,
    '',
    '## Outcome',
    '',
    '- Implementation: COMPLETED',
    `- Verification: ${verificationLabel}`,
    `- Task closure: ${closureLabel}`,
    `- Plan archive: ${planLabel}`,
    ...(plan.source_path ? [
      `- Active plan: ${sanitized(plan.source_path)}`,
      `- Archived plan: ${sanitized(plan.archive_path)}`,
    ] : []),
    '',
    '## Scope',
    '',
    '### Reviewed changed scope',
    '',
    ...pathLines(changedPaths),
    '',
    '### Final published scope',
    '',
    ...pathLines(publishPaths),
    '',
    '## Executable proof',
    '',
  ];
  if (!steps.length) lines.push('- None.');
  steps.forEach((step, index) => {
    if (index) lines.push('');
    const label = step.status === 0 ? 'PASS' : 'BLOCKED';
    lines.push(
      `### ${sanitized(step.name)} — ${label}`,
      '',
      `- Summary: ${sanitized(step.summary)}`,
    );
    if (step.status !== 0) lines.push(`- Failure classification: ${sanitized(step.classification)}`);
  });
  lines.push(
    '',
    '## QA decisions',
    '',
    `- Permanent coverage: ${sanitized(coverage.status || 'none')}`,
  );
  if (coverage.protected_contract) lines.push(`- Protected contract: ${sanitized(coverage.protected_contract)}`);
  lines.push(
    `- Temporary verification: ${sanitized(qa.temporary_verification || 'not-used')}`,
    `- QA tooling: ${sanitized(qa.status || 'unchanged')}`,
    '',
    '## Maintenance',
    '',
    ...maintenanceLines(maintenanceItems),
    '',
    '---',
    '',
    'Generated mechanically by `scripts/task-close.mjs` from sanitized structured close-out evidence. Raw logs remain private.',
  );
  return `${lines.join('\n')}\n`;
}

export function writePublicQaReceipt(root, data) {
  const path = publicQaReceiptPath(data.identity);
  const absolute = resolve(root, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, renderPublicQaReceipt(data));
  return path;
}
