import { compareStable } from './naming';
import type { ExportPackageManifest, PackageFile, PackagePngAsset } from './types';

const encoder = new TextEncoder();

export interface PackageInput {
  manifest: ExportPackageManifest;
  raw: unknown;
  referencePng: Uint8Array;
  assets: readonly PackagePngAsset[];
}

export function createPackageFiles(input: PackageInput): PackageFile[] {
  const assetBytes = new Map(input.assets.map(asset => [asset.node_id, asset.bytes]));
  const directory = input.manifest.screen.directory;
  const assets = input.manifest.assets.map(entry => {
    const bytes = assetBytes.get(entry.node_id);
    if (!bytes) throw new Error(`Missing PNG bytes for ${entry.node_id}.`);
    return { path: `${directory}/${entry.filename}`, bytes };
  });
  return [
    ...assets,
    { path: `${directory}/export-manifest.json`, bytes: encoder.encode(`${JSON.stringify(input.manifest, null, 2)}\n`) },
    { path: `${directory}/figma.raw.json`, bytes: encoder.encode(`${JSON.stringify(input.raw, null, 2)}\n`) },
    { path: `${directory}/reference.png`, bytes: input.referencePng },
  ].sort((left, right) => compareStable(left.path, right.path));
}
