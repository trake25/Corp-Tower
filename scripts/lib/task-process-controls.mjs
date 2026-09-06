export const TASK_PROCESS_CONTROL_NAMES = Object.freeze([
  'task_ownership',
  'task_close',
  'telemetry',
  'workflow_inefficiency_flagging',
  'qa',
  'qa_coverage',
  'qa_receipt',
  'plan_archival',
]);

export const LEGACY_TASK_PROCESS_CONTROL_NAMES = Object.freeze([
  'telemetry',
  'workflow_inefficiency_flagging',
  'qa',
  'qa_coverage',
  'qa_receipt',
  'plan_archival',
]);

const BARE_VALUES = Object.freeze({
  task_ownership: false,
  task_close: false,
  telemetry: false,
  workflow_inefficiency_flagging: false,
  qa: false,
  qa_coverage: false,
  qa_receipt: false,
  plan_archival: true,
});

const ALL_VALUES = Object.freeze(Object.fromEntries(TASK_PROCESS_CONTROL_NAMES.map(name => [name, true])));

export const BARE_TASK_PROCESS_CONTROLS = Object.freeze({ profile: 'bare', ...BARE_VALUES });
export const ALL_TASK_PROCESS_CONTROLS = Object.freeze({ profile: 'all', ...ALL_VALUES });
export const LEGACY_TASK_PROCESS_CONTROLS = ALL_TASK_PROCESS_CONTROLS;

function sameValues(left, right) {
  return TASK_PROCESS_CONTROL_NAMES.every(name => left[name] === right[name]);
}

function sameLegacyValues(left, right) {
  return LEGACY_TASK_PROCESS_CONTROL_NAMES.every(name => left[name] === right[name]);
}

function derivedProfile(values) {
  if (sameValues(values, BARE_VALUES)) return 'bare';
  if (sameValues(values, ALL_VALUES)) return 'all';
  return 'custom';
}

function validateDependency(values) {
  if (values.task_close && !values.task_ownership)
    throw new Error('task_close=on requires task_ownership=on');
  if (values.workflow_inefficiency_flagging && !values.telemetry)
    throw new Error('workflow_inefficiency_flagging=on requires telemetry=on');
}

export function validateTaskProcessControls(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('process controls must be an object');
  const allowed = new Set(['profile', ...TASK_PROCESS_CONTROL_NAMES]);
  const unknown = Object.keys(input).filter(name => !allowed.has(name));
  if (unknown.length) throw new Error(`unknown process control field: ${unknown.join(', ')}`);
  if (!['bare', 'all', 'custom'].includes(input.profile))
    throw new Error('process profile must be bare, all, or custom');
  for (const name of TASK_PROCESS_CONTROL_NAMES) {
    if (!Object.hasOwn(input, name)) throw new Error(`process control ${name} is required`);
    if (typeof input[name] !== 'boolean') throw new Error(`process control ${name} must be boolean`);
  }
  validateDependency(input);
  const profile = derivedProfile(input);
  if (input.profile !== profile)
    throw new Error(`process profile ${input.profile} does not match resolved ${profile} controls`);
  return { profile, ...Object.fromEntries(TASK_PROCESS_CONTROL_NAMES.map(name => [name, input[name]])) };
}

export function resolveTaskProcessControls({ profile = 'bare', overrides = [] } = {}) {
  if (!['bare', 'all'].includes(profile)) throw new Error('process profile must be bare or all');
  const values = { ...(profile === 'all' ? ALL_VALUES : BARE_VALUES) };
  const seen = new Map();
  for (const override of overrides) {
    const match = /^([^=]+)=(on|off)$/.exec(override);
    if (!match) throw new Error(`invalid process override ${override}; expected <name>=on|off`);
    const [, name, state] = match;
    if (!TASK_PROCESS_CONTROL_NAMES.includes(name)) throw new Error(`unknown process control: ${name}`);
    const enabled = state === 'on';
    if (seen.has(name) && seen.get(name) !== enabled)
      throw new Error(`conflicting process overrides for ${name}`);
    seen.set(name, enabled);
    values[name] = enabled;
  }
  return validateTaskProcessControls({ profile: derivedProfile(values), ...values });
}

function validateLegacySchemaV3Process(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('process controls must be an object');
  const allowed = new Set(['profile', ...LEGACY_TASK_PROCESS_CONTROL_NAMES]);
  const unknown = Object.keys(input).filter(name => !allowed.has(name));
  if (unknown.length) throw new Error(`unknown process control field: ${unknown.join(', ')}`);
  if (!['bare', 'all', 'custom'].includes(input.profile))
    throw new Error('process profile must be bare, all, or custom');
  for (const name of LEGACY_TASK_PROCESS_CONTROL_NAMES) {
    if (!Object.hasOwn(input, name)) throw new Error(`process control ${name} is required`);
    if (typeof input[name] !== 'boolean') throw new Error(`process control ${name} must be boolean`);
  }
  const legacyBare = Object.fromEntries(LEGACY_TASK_PROCESS_CONTROL_NAMES.map(name => [name, BARE_VALUES[name]]));
  const legacyAll = Object.fromEntries(LEGACY_TASK_PROCESS_CONTROL_NAMES.map(name => [name, ALL_VALUES[name]]));
  const profile = sameLegacyValues(input, legacyBare) ? 'bare' : sameLegacyValues(input, legacyAll) ? 'all' : 'custom';
  if (input.profile !== profile)
    throw new Error(`process profile ${input.profile} does not match resolved ${profile} controls`);
  if (input.workflow_inefficiency_flagging && !input.telemetry)
    throw new Error('workflow_inefficiency_flagging=on requires telemetry=on');
  const normalized = {
    task_ownership: true,
    task_close: true,
    ...Object.fromEntries(LEGACY_TASK_PROCESS_CONTROL_NAMES.map(name => [name, input[name]])),
  };
  return validateTaskProcessControls({ profile: derivedProfile(normalized), ...normalized });
}

export function taskProcessControlsForManifest(manifest) {
  if (manifest?.schema_version === 2) return { ...LEGACY_TASK_PROCESS_CONTROLS };
  if (manifest?.schema_version === 3) {
    try {
      return validateLegacySchemaV3Process(manifest.process);
    } catch (error) {
      throw new Error(`malformed schema-v3 process contract: ${error.message}`);
    }
  }
  if (manifest?.schema_version !== 4)
    throw new Error(`unsupported manifest schema: ${manifest?.schema_version}`);
  try {
    return validateTaskProcessControls(manifest.process);
  } catch (error) {
    throw new Error(`malformed schema-v4 process contract: ${error.message}`);
  }
}
