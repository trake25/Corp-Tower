import { candidateFileNames, compareStable, screenDirectoryName } from './naming';
import { PNG_SCALES, type AssetCandidate, type ExportPackageManifest, type PngScale, type RootFrame } from './types';

export function isPngScale(value: unknown): value is PngScale {
  return typeof value === 'number' && PNG_SCALES.includes(value as PngScale);
}

export interface ManifestInput {
  pluginVersion: string;
  root: RootFrame;
  scale: PngScale;
  candidates: readonly AssetCandidate[];
}

export function createExportManifest(input: ManifestInput): ExportPackageManifest {
  if (!isPngScale(input.scale)) throw new Error('PNG scale must be one of 1x, 2x, 3x, or 4x.');
  const candidates = [...input.candidates].sort((left, right) => compareStable(left.node.id, right.node.id));
  const fileNames = new Map(candidateFileNames(candidates.map(candidate => candidate.node)).map(item => [item.id, item.filename]));
  return {
    schema_version: 1,
    plugin_version: input.pluginVersion,
    raw_format: 'JSON_REST_V1',
    screen: {
      node_id: input.root.id,
      name: input.root.name,
      directory: screenDirectoryName(input.root.name),
      width: input.root.width,
      height: input.root.height,
    },
    png_scale: input.scale,
    files: {
      raw_json: 'figma.raw.json',
      reference_png: 'reference.png',
      assets_directory: 'assets',
    },
    assets: candidates.map(candidate => ({
      node_id: candidate.node.id,
      name: candidate.node.name,
      filename: fileNames.get(candidate.node.id) || 'assets/asset.png',
      scale: input.scale,
      width: candidate.node.width,
      height: candidate.node.height,
      candidate_reason: candidate.reason,
    })),
  };
}
