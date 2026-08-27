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

export function buildTaskTelemetry(manifest, receipt, evidence, { domainFor, receiptHash }) {
  const toolEvents = evidence.filter(item => item.kind === 'tool');
  const failures = toolEvents.filter(item => item.outcome === 'failed').length;
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
      run: receipt.steps.length,
      failures: receipt.steps.filter(step => step.status !== 0).length,
      retests: 0,
    },
    documentation: { files: manifest.documented_paths.length, updates: manifest.documented_paths.length },
    task_close: { status: receipt.status, receipt_hash: receiptHash },
  };
}
