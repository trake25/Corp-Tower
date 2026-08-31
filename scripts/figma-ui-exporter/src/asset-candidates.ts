import { compareStable } from './naming';
import type { AssetCandidate, CandidateNode, CandidateReason } from './types';

export function candidateReason(node: CandidateNode): CandidateReason | null {
  if (node.visible === false) return null;
  if (/\[asset\]/i.test(node.name)) return 'explicit_asset_tag';
  if (node.type === 'VECTOR') return 'vector';
  if (node.type === 'BOOLEAN_OPERATION') return 'boolean_operation';
  if (node.fills?.some(fill => fill.type === 'IMAGE' && fill.visible !== false)) return 'image_fill';
  return null;
}

function collect(node: CandidateNode, output: AssetCandidate[]): void {
  if (node.visible === false) return;
  const reason = candidateReason(node);
  if (reason) output.push({ node, reason });
  for (const child of node.children || []) collect(child, output);
}

export function collectAssetCandidates(root: CandidateNode): AssetCandidate[] {
  const output: AssetCandidate[] = [];
  for (const child of root.children || []) collect(child, output);
  return output.sort((left, right) => compareStable(left.node.id, right.node.id));
}
