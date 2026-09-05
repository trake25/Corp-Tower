import { isMaintenanceClassification } from '../maintenance-handoff.mjs';

function retrievalTelemetry(evidence, fallbacks) {
  const events = evidence.filter(item => item.kind === 'tool'
    && item.stage === 'retrieval_context'
    && item.name.startsWith('concept_')
    && item.retrieval_key)
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const requests = new Map();
  for (const event of events) requests.set(event.retrieval_key, [...(requests.get(event.retrieval_key) || []), event]);
  const sameConceptRetries = [...requests.values()].reduce((count, attempts) => count + attempts
    .slice(1)
    .filter((item, index) => attempts.slice(0, index + 1).some(previous => previous.outcome === 'failed')).length, 0);
  const defects = events.filter(item => item.outcome === 'failed').length;
  const first = events[0];
  return {
    concept_operations: events.length,
    same_concept_retries: sameConceptRetries,
    defects,
    fallbacks,
    first_try: Boolean(first && first.outcome === 'passed' && defects === 0 && fallbacks === 0 && sameConceptRetries === 0),
  };
}

function toolRecoveryCount(events) {
  const attempts = new Map();
  for (const event of events) {
    if (!event.tool_key) continue;
    attempts.set(event.tool_key, [...(attempts.get(event.tool_key) || []), event]);
  }
  return [...attempts.values()].reduce((count, attempts) => count + attempts
    .slice(1)
    .filter((item, index) => item.outcome === 'passed' && attempts.slice(0, index + 1).some(previous => previous.outcome === 'failed')).length, 0);
}

function implementationTelemetry(evidence) {
  let repairNeeded = false;
  let reworkCycles = 0;
  for (const event of evidence.slice().sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))) {
    if (event.stage === 'verification' && event.outcome === 'failed') repairNeeded = true;
    if (repairNeeded && event.stage === 'implementation' && event.outcome === 'passed') {
      reworkCycles++;
      repairNeeded = false;
    }
  }
  return { rework_cycles: reworkCycles };
}

function verificationTelemetry(steps, evidence) {
  const observed = evidence.filter(item => item.stage === 'verification' && item.kind === 'tool');
  const runs = steps.length || observed.length;
  const failures = steps.length
    ? steps.filter(step => step.status !== 0).length
    : observed.filter(item => item.outcome === 'failed').length;
  const unresolvedRetests = Math.max(0, observed.filter(item => item.outcome === 'failed').length - 1);
  return { runs, failures, unresolved_retests: unresolvedRetests };
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
    tools: { calls: toolEvents.length, failures, recoveries: toolRecoveryCount(toolEvents) },
    retrieval: retrievalTelemetry(evidence, manifest.retrieval.fallbacks.length),
    worker_count: 0,
    files: { modified: manifest.changed_paths.length, domains },
    implementation: implementationTelemetry(evidence),
    verification: verificationTelemetry(steps, evidence),
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
