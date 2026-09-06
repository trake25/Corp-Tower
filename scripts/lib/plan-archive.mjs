import { existsSync, lstatSync, mkdirSync, realpathSync, renameSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';

function displayPath(root, path) {
  return relative(resolve(root), path).replaceAll('\\', '/');
}

export function unboundPlan() {
  return {
    status: 'not-applicable',
    source_path: null,
    archive_path: null,
    diagnostic: null,
  };
}

function recordedPlanPaths(plan, root = '.') {
  const repositoryRoot = resolve(root);
  const source = resolve(repositoryRoot, plan.source_path || '');
  const archive = resolve(repositoryRoot, plan.archive_path || '');
  const planRoot = resolve(repositoryRoot, 'plan');
  const expectedArchive = resolve(planRoot, 'done', basename(source));
  if (!plan?.source_path || !source.startsWith(`${planRoot}${sep}`) || source.startsWith(`${resolve(planRoot, 'done')}${sep}`))
    throw new Error('recorded plan source is unsafe');
  if (archive !== expectedArchive) throw new Error('recorded plan archive destination is unsafe');
  return { source, archive };
}

export function planBindingFor(input, root = '.') {
  if (!input) return unboundPlan();
  const repositoryRoot = resolve(root);
  const planRoot = resolve(repositoryRoot, 'plan');
  const source = resolve(repositoryRoot, input);
  if (source === repositoryRoot || !source.startsWith(`${repositoryRoot}${sep}`))
    throw new Error('--plan must stay inside the repository');
  if (!source.startsWith(`${planRoot}${sep}`)) throw new Error('--plan must be an active Markdown file under plan/');
  const activeRelative = relative(planRoot, source);
  if (activeRelative.split(sep)[0] === 'done') throw new Error('--plan cannot already be under plan/done/');
  if (!source.endsWith('.md')) throw new Error('--plan must name a Markdown file');
  if (!existsSync(source) || !lstatSync(source).isFile()) throw new Error('--plan must name an existing active plan');
  const realPlanRoot = realpathSync(planRoot);
  const realSource = realpathSync(source);
  if (realSource === realPlanRoot || !realSource.startsWith(`${realPlanRoot}${sep}`))
    throw new Error('--plan resolves outside plan/');
  const archive = resolve(planRoot, 'done', basename(source));
  if (existsSync(archive)) throw new Error(`plan archive destination already exists: ${displayPath(repositoryRoot, archive)}`);
  return {
    status: 'pending',
    source_path: displayPath(repositoryRoot, source),
    archive_path: displayPath(repositoryRoot, archive),
    diagnostic: null,
  };
}

export function archivePlan(plan, root = '.') {
  if (!plan || plan.status === 'not-applicable') return unboundPlan();
  try {
    const { source, archive } = recordedPlanPaths(plan, root);
    const sourceExists = existsSync(source);
    const archiveExists = existsSync(archive);
    if (sourceExists && archiveExists) throw new Error('active plan and archive destination both exist; refusing to overwrite');
    if (!sourceExists && archiveExists) return { ...plan, status: 'archived', diagnostic: null };
    if (!sourceExists) throw new Error('active plan is absent and no completed archive exists');
    mkdirSync(dirname(archive), { recursive: true });
    renameSync(source, archive);
    return { ...plan, status: 'archived', diagnostic: null };
  } catch (error) {
    return { ...plan, status: 'failed', diagnostic: error.message };
  }
}

export function retainPlan(plan, root = '.') {
  if (!plan || plan.status === 'not-applicable') return unboundPlan();
  try {
    const { source, archive } = recordedPlanPaths(plan, root);
    if (!existsSync(source)) throw new Error('active plan is absent while archival is disabled');
    if (existsSync(archive)) throw new Error('archive destination exists while archival is disabled');
    return { ...plan, status: 'retained', diagnostic: 'skipped-by-process-control' };
  } catch (error) {
    return { ...plan, status: 'failed', diagnostic: error.message };
  }
}
