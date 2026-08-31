import { isMaintenanceClassification } from '../maintenance-handoff.mjs';

function retrievalTelemetry(evidence, fallbacks) {
  const events = evidence.filter(item => item.kind === 'tool' && item.stage === 'retrieval_context' && item.name.startsWith('context_'));
  const queries = events.filter(item => /^context_(search|filter)_/.test(item.name));
  const filters = queries.filter(item => item.name.startsWith('context_filter_')).length;
  const needs = queries.filter(item => /_needs_(anchor|filter)$/.test(item.name)).length;
  const attempts = queries.length || (events.length ? 1 : 0);
  const firstSearch = queries[0]?.name || '';
  return {
    attempts,
    expansions: Math.max(filters, needs),
    fallbacks,
    first_try: Boolean(attempts && firstSearch === 'context_search_matched' && filters === 0 && fallbacks === 0),
  };
}

const telemetryCode = value => String(value || 'not_applicable').replaceAll('-', '_');
const documentationOutcome = status => ['planner-follow-up', 'not-applicable', 'updated', 'not-needed'].includes(status)
  ? telemetryCode(status)
  : 'not_applicable';

function stepOutcome(steps, names) {
  const selected = steps.filter(step => names.includes(step.name));
  if (!selected.length) return 'not_applicable';
  if (selected.every(step => step.status === 0)) return 'passed';
  return selected.every(step => step.status !== 0 && isMaintenanceClassification(step.classification))
    ? 'maintenance_blocked'
    : 'failed';
}

export function buildTaskTelemetry(manifest, receipt, evidence, { domainFor, receiptHash }) {
  const toolEvents = evidence.filter(item => item.kind === 'tool');
  const failures = toolEvents.filter(item => item.outcome === 'failed').length;
  const steps = receipt.steps || [];
  const maintenanceBlockers = (receipt.maintenance?.items || []).filter(item => item.state === 'blocking').length;
  const coverageStatus = ['reused', 'added', 'updated', 'none'].includes(manifest.coverage?.status)
    ? manifest.coverage.status
    : 'none';
  const domains = Object.fromEntries(manifest.domains.map(domain => [
    domain.replaceAll('-', '_'),
    manifest.changed_paths.filter(path => domainFor(path) === domain).length,
  ]));
  return {
    tools: { calls: toolEvents.length, failures, retries: 0 },
    retrieval: retrievalTelemetry(evidence, manifest.retrieval.fallbacks.length),
    skills: [],
    worker_count: 1,
    files: { inspected: 0, modified: manifest.changed_paths.length, domains },
    iterations: { implementation: manifest.changed_paths.length ? 1 : 0, rework: 0 },
    checks: {
      run: steps.length,
      failures: steps.filter(step => step.status !== 0).length,
      retests: 0,
    },
    documentation: { files: manifest.documented_paths.length, updates: manifest.documented_paths.length },
    qa: {
      executed: telemetryCode(receipt.qa?.executed || stepOutcome(steps, ['QA'])),
      permanent_coverage: telemetryCode(receipt.qa?.permanent_coverage || coverageStatus),
      temporary_verification: telemetryCode(receipt.qa?.temporary_verification || manifest.qa?.temporary_verification || 'not-used'),
      qa_tooling: telemetryCode(receipt.qa?.qa_tooling || manifest.qa?.status || 'unchanged'),
    },
    task_close: { status: telemetryCode(receipt.status), receipt_hash: receiptHash },
    outcomes: {
      implementation: receipt.status === 'failed'
        ? 'failed'
        : manifest.changed_paths.length ? 'complete' : 'not_applicable',
      task_qa: stepOutcome(steps, ['QA']),
      documentation: documentationOutcome(manifest.documentation?.status || manifest.documentation?.decision),
      maps_retrieval: stepOutcome(steps, ['automation protocol', 'retrieval benchmark', 'file map', 'game KB', 'site KB']),
      close_out: telemetryCode(receipt.status),
      maintenance_blockers: maintenanceBlockers,
    },
  };
}
