import type { CandidateNode } from './types';

export function compareStable(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function safeName(value: string, fallback = 'asset'): string {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 72);
  return normalized || fallback;
}

export function screenDirectoryName(name: string): string {
  const parts = safeName(name, 'screen').split('-');
  return parts.map(part => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join('');
}

export function stableNodeSuffix(nodeId: string): string {
  return `node-${Array.from(nodeId)
    .map(character => character.codePointAt(0)?.toString(16).padStart(6, '0') || '000000')
    .join('')}`;
}

export interface NamedAsset {
  id: string;
  name: string;
}

export interface NamedAssetFile extends NamedAsset {
  filename: string;
}

export function assetFilenames(items: readonly NamedAsset[]): NamedAssetFile[] {
  const bases = items.map(item => safeName(item.name));
  const counts = new Map<string, number>();
  bases.forEach(base => counts.set(base, (counts.get(base) || 0) + 1));
  return items
    .map((item, index) => {
      const base = bases[index];
      const suffix = counts.get(base) === 1 ? '' : `--${stableNodeSuffix(item.id)}`;
      return { ...item, filename: `assets/${base}${suffix}.png` };
    })
    .sort((left, right) => compareStable(left.id, right.id));
}

export function candidateFileNames(candidates: readonly CandidateNode[]): NamedAssetFile[] {
  return assetFilenames(candidates.map(candidate => ({ id: candidate.id, name: candidate.name })));
}
