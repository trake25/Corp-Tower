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
  if (!plan?.source_path) throw new Error('recorded plan source is unsafe');
  const paths = planPathsFor(plan.source_path, root, {
    requireActiveSource: false,
    requireFreeArchive: false,
  });
  if (plan.archive_path !== displayPath(paths.repositoryRoot, paths.archive))
    throw new Error('recorded plan archive destination is unsafe');
  return paths;
}

function lstatOrNull(path) {
  try { return lstatSync(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertPlanTraversal(planRoot, target) {
  const relativeTarget = relative(planRoot, target);
  if (!relativeTarget || relativeTarget.startsWith('..') || relativeTarget === '..')
    throw new Error('--plan must stay inside the repository plan directory');
  let current = planRoot;
  for (const part of relativeTarget.split(sep)) {
    current = resolve(current, part);
    const info = lstatOrNull(current);
    if (!info) break;
    if (info.isSymbolicLink()) throw new Error('--plan must not traverse symbolic links');
    if (current !== target && !info.isDirectory()) throw new Error('--plan path must use directories before its filename');
  }
}

function planPathsFor(input, root, { requireActiveSource, requireFreeArchive }) {
  if (typeof input !== 'string' || !input) throw new Error('--plan is required');
  const repositoryRoot = resolve(root);
  const planRoot = resolve(repositoryRoot, 'plan');
  const source = resolve(repositoryRoot, input);
  if (source === repositoryRoot || !source.startsWith(`${repositoryRoot}${sep}`))
    throw new Error('--plan must stay inside the repository');
  if (!source.startsWith(`${planRoot}${sep}`)) throw new Error('--plan must be an active Markdown file under plan/');
  const activeRelative = relative(planRoot, source);
  if (activeRelative.split(sep)[0] === 'done') throw new Error('--plan cannot already be under plan/done/');
  if (!source.endsWith('.md')) throw new Error('--plan must name a Markdown file');
  const realPlanRoot = realpathSync(planRoot);
  assertPlanTraversal(planRoot, source);
  const sourceInfo = lstatOrNull(source);
  if (sourceInfo) {
    if (!sourceInfo.isFile()) throw new Error('--plan must name an existing active plan');
    const realSource = realpathSync(source);
    if (realSource === realPlanRoot || !realSource.startsWith(`${realPlanRoot}${sep}`))
      throw new Error('--plan resolves outside plan/');
  } else if (requireActiveSource) {
    throw new Error('--plan must name an existing active plan');
  }
  const archive = resolve(planRoot, 'done', basename(source));
  assertPlanTraversal(planRoot, archive);
  const archiveInfo = lstatOrNull(archive);
  if (archiveInfo) {
    if (!archiveInfo.isFile()) throw new Error('plan archive destination must be a regular file');
    const realArchive = realpathSync(archive);
    if (realArchive === realPlanRoot || !realArchive.startsWith(`${realPlanRoot}${sep}`))
      throw new Error('plan archive destination resolves outside plan/');
  }
  if (requireFreeArchive && archiveInfo)
    throw new Error(`plan archive destination already exists: ${displayPath(repositoryRoot, archive)}`);
  return { repositoryRoot, source, archive };
}

function bindingForPaths({ repositoryRoot, source, archive }) {
  return {
    status: 'pending',
    source_path: displayPath(repositoryRoot, source),
    archive_path: displayPath(repositoryRoot, archive),
    diagnostic: null,
  };
}

export function planBindingFor(input, root = '.') {
  if (!input) return unboundPlan();
  return bindingForPaths(planPathsFor(input, root, {
    requireActiveSource: true,
    requireFreeArchive: true,
  }));
}

export function standaloneArchiveBindingFor(input, root = '.') {
  return bindingForPaths(planPathsFor(input, root, {
    requireActiveSource: false,
    requireFreeArchive: false,
  }));
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
