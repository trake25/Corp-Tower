import { readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { strToU8, zipSync } from 'fflate';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(project, 'dist');
const command = process.argv[2] || 'bundle';
const args = process.argv.slice(3);

function option(name) {
  const index = args.indexOf(name);
  return index === -1 ? '' : args[index + 1] || '';
}

async function json(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function assertManifestContract(manifest) {
  if (JSON.stringify(manifest.editorType) !== JSON.stringify(['figma'])) throw new Error('Manifest must limit editorType to ["figma"].');
  if (manifest.documentAccess !== 'dynamic-page') throw new Error('Manifest must use documentAccess "dynamic-page".');
  if (JSON.stringify(manifest.networkAccess?.allowedDomains) !== JSON.stringify(['none'])) throw new Error('Manifest must deny network access with allowedDomains ["none"].');
}

async function resolvePluginId() {
  const supplied = option('--plugin-id');
  if (supplied.trim()) return supplied.trim();
  try {
    const local = await json(resolve(project, 'figma-plugin.local.json'));
    if (typeof local.pluginId === 'string' && local.pluginId.trim()) return local.pluginId.trim();
  } catch {
    return '';
  }
  return '';
}

async function bundle() {
  const packageJson = await json(resolve(project, 'package.json'));
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  await build({
    entryPoints: [resolve(project, 'src/main.ts')],
    bundle: true,
    outfile: resolve(dist, 'main.js'),
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    define: { __PLUGIN_VERSION__: JSON.stringify(packageJson.version) },
  });
  await build({
    entryPoints: [resolve(project, 'ui/index.ts')],
    bundle: true,
    outfile: resolve(dist, 'ui.js'),
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
  });
  await build({
    entryPoints: [resolve(project, 'src/core.ts')],
    bundle: true,
    outfile: resolve(dist, 'core.cjs'),
    platform: 'node',
    format: 'cjs',
    target: 'node18',
  });
  const [html, css, ui] = await Promise.all([
    readFile(resolve(project, 'ui/index.html'), 'utf8'),
    readFile(resolve(project, 'ui/styles.css'), 'utf8'),
    readFile(resolve(dist, 'ui.js'), 'utf8'),
  ]);
  const inline = html
    .replace('<link rel="stylesheet" href="./styles.css">', `<style>${css}</style>`)
    .replace('<script src="./ui.js"></script>', `<script>${ui}</script>`);
  await writeFile(resolve(dist, 'ui.html'), inline);
  await rm(resolve(dist, 'ui.js'));
}

async function packagePlugin() {
  await bundle();
  const pluginId = await resolvePluginId();
  if (!pluginId) throw new Error('Provide --plugin-id <Figma plugin ID> or create ignored figma-plugin.local.json with {"pluginId":"…"}.');
  const manifest = await json(resolve(project, 'manifest.template.json'));
  manifest.id = pluginId;
  assertManifestContract(manifest);
  await writeFile(resolve(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const files = Object.fromEntries(await Promise.all(['main.js', 'manifest.json', 'ui.html'].map(async name => [name, await readFile(resolve(dist, name))])));
  await writeFile(resolve(dist, 'corp-tower-game-ui-exporter.zip'), zipSync(files, { level: 6, mtime: new Date('1980-01-01T00:00:00Z') }));
}

async function verifyManifest() {
  const manifestPath = option('--manifest') || resolve(project, 'manifest.template.json');
  const manifest = await json(resolve(project, manifestPath));
  assertManifestContract(manifest);
  if (!manifest.id || manifest.id === '__FIGMA_PLUGIN_ID__') {
    if (manifestPath.endsWith('manifest.template.json')) return;
    throw new Error('Generated manifest must contain a real Figma plugin ID.');
  }
}

if (command === 'bundle') await bundle();
else if (command === 'package') await packagePlugin();
else if (command === 'verify-manifest') await verifyManifest();
else throw new Error('Use bundle, package, or verify-manifest.');
