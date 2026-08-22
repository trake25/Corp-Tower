import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const CLIENT = 'src/Client/App/corp-tower';
const tutorialRoot = `${CLIENT}/Cor/Scripts/GameUi/Tutorial`;
const tutorialScenes = [
  `${CLIENT}/Cor/Scenes/TutorialLayer.tscn`,
];
const debugFiles = [
  `${CLIENT}/Cor/Scripts/GameUi/DebugPanelController.gd`,
  `${CLIENT}/Cor/Scripts/GameUi/DebugPanelCatalog.gd`,
  `${CLIENT}/Cor/Scripts/DebugTooltip.gd`,
  `${CLIENT}/Cor/Scripts/DebugOverlay.gd`,
  `${CLIENT}/Cor/Scenes/DebugPanel.tscn`,
];
const hudFiles = [
  `${CLIENT}/Cor/Scripts/TowerStack.gd`,
  `${CLIENT}/Cor/Scripts/BlockPreview.gd`,
  `${CLIENT}/Cor/Scripts/PopoverPanel.gd`,
  `${CLIENT}/Cor/Scripts/ImpactBar.gd`,
  `${CLIENT}/Cor/Scripts/CooldownOverlay.gd`,
  `${CLIENT}/Cor/Scripts/PressTintButton.gd`,
  `${CLIENT}/Cor/Scripts/PlayerColors.gd`,
  `${CLIENT}/Cor/Scripts/BackgroundParallax.gd`,
  `${CLIENT}/Cor/Scenes/GameUI.tscn`,
  `${CLIENT}/Cor/Scenes/ImpactBar.tscn`,
  `${CLIENT}/Cor/Scenes/LevelSummary.tscn`,
  `${CLIENT}/Cor/Scenes/PlayerRailEntry.tscn`,
  `${CLIENT}/Cor/Scenes/PlayField.tscn`,
  `${CLIENT}/Cor/Scenes/PopoverPanel.tscn`,
];

export const MAP_AREAS = [
  {
    name: 'backend', out: 'backend.md', title: 'Backend — `src/Server/**`',
    roots: ['src/Server/app', 'src/Server/tools', 'src/Server/migrations'], exts: ['.js', '.sql'],
  },
  {
    name: 'ui-tutorial', out: 'ui-tutorial.md',
    title: 'Client — Tutorial `Cor/Scripts/GameUi/Tutorial/**`',
    roots: [tutorialRoot], files: tutorialScenes, exts: ['.gd', '.tscn'],
  },
  {
    name: 'ui-debug', out: 'ui-debug.md', title: 'Client — Debug tooling',
    files: debugFiles, exts: ['.gd', '.tscn'],
  },
  {
    name: 'ui-hud', out: 'ui-hud.md',
    title: 'Client — Gameplay HUD & Stack `Cor/Scripts/GameUi/**` (+ leaf components)',
    roots: [`${CLIENT}/Cor/Scripts/GameUi`], files: hudFiles, exts: ['.gd', '.tscn'],
  },
  {
    name: 'ui-screens', out: 'ui-screens.md',
    title: 'Client — Screens & Navigation `corp-tower/{Cor,Sys}/**`',
    roots: [`${CLIENT}/Cor`, `${CLIENT}/Sys`], exts: ['.gd', '.tscn'],
  },
  {
    name: 'infra', out: 'infra.md',
    title: 'Infra — `infra/` · `.github/` · `scripts/`',
    roots: ['infra', '.github/workflows', '.github/actions', 'scripts', 'docker'],
    exts: ['.tf', '.yml', '.yaml', '.sh', '.mjs'],
  },
];

export const ROUTE_RULES = [
  { pattern: /^src\/Server\/app\/Game_Config\.js$/, skill: 'server-engineer', docs: ['backend.md', 'gameplay.md'], map: 'backend.md', read: 'full' },
  { pattern: /^src\/Server\/app\/(Server|Redis_State)\.js$/, skill: 'fullstack-coordinator', docs: ['networking.md', 'backend.md'], map: 'backend.md', read: 'hunk' },
  { pattern: /^src\/Server\/app\//, skill: 'server-engineer', docs: ['backend.md'], map: 'backend.md', read: 'hunk' },
  { pattern: /^src\/Server\/migrations\//, skill: 'server-engineer', docs: ['backend.md'], map: 'backend.md', read: 'hunk' },
  { pattern: /^src\/Server\/tests\//, skill: 'qa-engineer', docs: ['testing.md'], map: null, read: 'hunk' },
  { pattern: /^src\/Server\/tools\//, skill: 'qa-engineer', docs: ['testing.md'], map: 'backend.md', read: 'hunk' },
  { pattern: /^src\/Server\/Dockerfile$/, skill: 'infra-engineer', docs: ['build.md'], map: null, read: 'hunk' },
  { pattern: /^src\/Server\/package\.json$/, skill: 'server-engineer', docs: ['backend.md', 'build.md'], map: null, read: 'hunk' },
  { pattern: new RegExp(`^${tutorialRoot}/`), skill: 'client-engineer', docs: ['ui-tutorial.md'], map: 'ui-tutorial.md', read: 'hunk' },
  { test: path => tutorialScenes.includes(path), skill: 'client-engineer', docs: ['ui-tutorial.md'], map: 'ui-tutorial.md', read: 'hunk' },
  { test: path => debugFiles.includes(path), skill: 'client-engineer', docs: ['ui-hud.md'], map: 'ui-debug.md', read: 'hunk' },
  { test: path => path.startsWith(`${CLIENT}/Cor/Scripts/GameUi/`) || hudFiles.includes(path), skill: 'client-engineer', docs: ['ui-hud.md'], map: 'ui-hud.md', read: 'hunk' },
  { pattern: new RegExp(`^${CLIENT}/Sys/NetMan/`), skill: 'fullstack-coordinator', docs: ['networking.md', 'ui.md'], map: 'ui-screens.md', read: 'hunk' },
  { pattern: new RegExp(`^${CLIENT}/Tests/`), skill: 'qa-engineer', docs: ['testing.md'], map: null, read: 'hunk' },
  { pattern: new RegExp(`^${CLIENT}/project\\.godot$`), skill: 'client-engineer', docs: ['ui.md', 'build.md'], map: null, read: 'hunk' },
  { pattern: new RegExp(`^${CLIENT}/(Cor|Sys)/`), skill: 'client-engineer', docs: ['ui.md'], map: 'ui-screens.md', read: 'hunk' },
  { pattern: new RegExp(`^${CLIENT}/`), skill: 'client-engineer', docs: ['ui.md'], map: null, read: 'hunk' },
  { pattern: /^\.github\/workflows\/EKS/, skill: 'infra-engineer', docs: ['deployment-eks.md'], map: 'infra.md', read: 'hunk' },
  { pattern: /^\.github\/workflows\/Backup/, skill: 'infra-engineer', docs: ['deployment-backup.md'], map: 'infra.md', read: 'hunk' },
  { pattern: /^\.github\/workflows\/Server/, skill: 'infra-engineer', docs: ['deployment.md'], map: 'infra.md', read: 'hunk' },
  { pattern: /^\.github\/workflows\//, skill: 'infra-engineer', docs: ['build.md'], map: 'infra.md', read: 'hunk' },
  { pattern: /^\.github\/actions\//, skill: 'infra-engineer', docs: ['build.md'], map: 'infra.md', read: 'hunk' },
  { pattern: /^infra\//, skill: 'infra-engineer', docs: ['deployment-eks.md'], map: 'infra.md', read: 'hunk' },
  { pattern: /^docker\//, skill: 'infra-engineer', docs: ['build.md'], map: 'infra.md', read: 'hunk' },
  { pattern: /^plugins\//, skill: 'infra-engineer', docs: ['build.md'], map: null, read: 'hunk' },
  { pattern: /^scripts\/(art-|ADDING-ART)/, skill: 'infra-engineer', docs: ['build.md'], map: 'infra.md', read: 'hunk' },
  { pattern: /^scripts\/backup\//, skill: 'infra-engineer', docs: ['deployment-backup.md'], map: 'infra.md', read: 'hunk' },
  { pattern: /^scripts\/write-endpoint-config/, skill: 'fullstack-coordinator', docs: ['networking.md', 'build.md'], map: 'infra.md', read: 'hunk' },
  { pattern: /^scripts\/(validate-docs|docs-scope|build-file-map|context|sync-agent-skills|validate-agent-config|task-report|benchmark-rag)\.mjs$/, skill: 'docs-steward', docs: [], map: 'infra.md', read: 'hunk' },
  { pattern: /^scripts\/install-git-hooks\.mjs$/, skill: 'infra-engineer', docs: [], map: 'infra.md', read: 'hunk' },
  { pattern: /^scripts\/qa-gate\.mjs$/, skill: 'qa-engineer', docs: ['testing.md'], map: 'infra.md', read: 'hunk' },
  { pattern: /^scripts\//, skill: 'qa-engineer', docs: ['testing.md'], map: 'infra.md', read: 'hunk' },
  { pattern: /^site\/src\/content\//, skill: 'editorial', docs: ['site/docs/content.md'], map: null, read: 'hunk' },
  { pattern: /^site\//, skill: 'web-designer', docs: ['site/docs/design.md'], map: null, read: 'hunk' },
];

export const AREA_ALIASES = {
  backend: { skill: 'server-engineer', docs: ['docs/context/backend.md'], maps: ['docs/context/map/backend.md'] },
  gameplay: { skill: 'server-engineer', docs: ['docs/context/gameplay.md'], maps: ['docs/context/map/backend.md'] },
  networking: { skill: 'fullstack-coordinator', docs: ['docs/context/networking.md'], maps: ['docs/context/map/backend.md', 'docs/context/map/ui-screens.md'] },
  screens: { skill: 'client-engineer', docs: ['docs/context/ui.md'], maps: ['docs/context/map/ui-screens.md'] },
  hud: { skill: 'client-engineer', docs: ['docs/context/ui-hud.md'], maps: ['docs/context/map/ui-hud.md', 'docs/context/map/ui-debug.md'] },
  tutorial: { skill: 'client-engineer', docs: ['docs/context/ui-tutorial.md'], maps: ['docs/context/map/ui-tutorial.md'] },
  infra: { skill: 'infra-engineer', docs: ['docs/context/deployment.md', 'docs/context/deployment-eks.md', 'docs/context/deployment-backup.md'], maps: ['docs/context/map/infra.md'] },
  build: { skill: 'infra-engineer', docs: ['docs/context/build.md'], maps: ['docs/context/map/infra.md'] },
  testing: { skill: 'qa-engineer', docs: ['docs/context/testing.md'], maps: [] },
  'site-design': { skill: 'web-designer', docs: ['site/docs/design.md'], maps: ['site/docs/index.md'] },
  'site-content': { skill: 'editorial', docs: ['site/docs/content.md'], maps: ['site/docs/index.md'] },
  docs: { skill: 'docs-steward', docs: ['docs/context/index.md'], maps: [] },
};

export function routeSourcePath(path) {
  const normalized = path.replace(/^\.\//, '').replaceAll('\\', '/');
  const rule = ROUTE_RULES.find(item => item.test ? item.test(normalized) : item.pattern.test(normalized));
  return rule ? { ...rule, path: normalized, pattern: undefined, test: undefined } : null;
}

export function mapOwnerForPath(path) {
  return routeSourcePath(path)?.map || null;
}

const IGNORE_DIR = /(^|[\\/])(addons|node_modules|\.godot|\.terraform|\.git|scripts[\\/]aws)([\\/]|$)/;
const IGNORE_PATH = [new RegExp(`^${CLIENT}/Cor/Art/`), /^site\//, /^site-root\//];
export const COVERAGE_EXEMPT = [/^src\/Server\/tests\//, new RegExp(`^${CLIENT}/Tests/`)];
const norm = path => path.split(/[\\/]/).join('/');

function walk(dir, root, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIR.test(absolute)) walk(absolute, root, out);
    } else if (entry.isFile()) out.push(norm(relative(root, absolute)));
  }
}

export function firstPartyFiles(root) {
  const claimed = new Set();
  const result = [];
  for (const area of MAP_AREAS) {
    const found = [];
    for (const routeRoot of area.roots || []) {
      const absolute = join(root, routeRoot);
      if (!existsSync(absolute)) continue;
      if (statSync(absolute).isFile()) found.push(norm(routeRoot));
      else walk(absolute, root, found);
    }
    for (const file of area.files || []) if (existsSync(join(root, file))) found.push(norm(file));
    for (const rel of [...new Set(found)].sort()) {
      if (claimed.has(rel) || !area.exts.some(ext => rel.endsWith(ext)) || IGNORE_PATH.some(re => re.test(rel))) continue;
      claimed.add(rel);
      result.push({ area: area.name, rel });
    }
  }
  return result;
}

export const isExempt = rel => COVERAGE_EXEMPT.some(re => re.test(rel));
