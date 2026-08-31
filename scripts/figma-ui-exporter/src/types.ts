export const PNG_SCALES = [1, 2, 3, 4] as const;

export type PngScale = typeof PNG_SCALES[number];

export const DEFAULT_PNG_SCALE: PngScale = 4;

export type CandidateReason = 'explicit_asset_tag' | 'image_fill' | 'vector' | 'boolean_operation';

export interface CandidateFill {
  type: string;
  visible?: boolean;
}

export interface CandidateNode {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
  visible?: boolean;
  fills?: readonly CandidateFill[];
  children?: readonly CandidateNode[];
}

export interface AssetCandidate {
  node: CandidateNode;
  reason: CandidateReason;
}

export interface ExportAssetEntry {
  node_id: string;
  name: string;
  filename: string;
  scale: PngScale;
  width: number;
  height: number;
  candidate_reason: CandidateReason;
}

export interface ExportPackageManifest {
  schema_version: 1;
  plugin_version: string;
  raw_format: 'JSON_REST_V1';
  screen: {
    node_id: string;
    name: string;
    directory: string;
    width: number;
    height: number;
  };
  png_scale: PngScale;
  files: {
    raw_json: 'figma.raw.json';
    reference_png: 'reference.png';
    assets_directory: 'assets';
  };
  assets: ExportAssetEntry[];
}

export interface RootFrame extends Pick<CandidateNode, 'id' | 'name' | 'width' | 'height'> {
  type: 'FRAME';
}

export interface PackagePngAsset {
  node_id: string;
  bytes: Uint8Array;
}

export interface PackageFile {
  path: string;
  bytes: Uint8Array;
}
