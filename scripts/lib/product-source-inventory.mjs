import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const CLIENT = 'src/Client/App/corp-tower';
const ROOTS = Object.freeze([
  { root: 'src/Server/app', extensions: ['.js'] },
  { root: 'src/Server/tools', extensions: ['.js'] },
  { root: 'src/Server/migrations', extensions: ['.js', '.sql'] },
  { root: `${CLIENT}/Cor`, extensions: ['.gd', '.tscn'] },
  { root: `${CLIENT}/Sys`, extensions: ['.gd', '.tscn'] },
]);
const EXCLUDED = Object.freeze([
  /^src\/Server\/tests\//,
  new RegExp(`^${CLIENT}/Tests/`),
  new RegExp(`^${CLIENT}/Cor/Art/`),
]);

const normalize = path => path.replaceAll('\\', '/');

function walk(directory, repositoryRoot, extensions, output) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute, repositoryRoot, extensions, output);
    else if (entry.isFile() && extensions.some(extension => entry.name.endsWith(extension)))
      output.push(normalize(relative(repositoryRoot, absolute)));
  }
}

export function productSourceFiles(repositoryRoot) {
  const files = [];
  for (const definition of ROOTS) {
    const absolute = join(repositoryRoot, definition.root);
    if (existsSync(absolute)) walk(absolute, repositoryRoot, definition.extensions, files);
  }
  return [...new Set(files)].filter(path => !EXCLUDED.some(pattern => pattern.test(path))).sort();
}
