import { collectAssetCandidates } from './asset-candidates';
import { createExportManifest, isPngScale } from './manifest';
import { validateRootSelection } from './selection';
import type { CandidateFill, CandidateNode, PngScale } from './types';

declare const __PLUGIN_VERSION__: string;

interface ExportFailure {
  node_id: string;
  name: string;
  reason: string;
  message: string;
}

function post(message: unknown): void {
  figma.ui.postMessage(message);
}

function childNodes(node: SceneNode): SceneNode[] {
  const candidate = node as unknown as { children?: readonly SceneNode[] };
  return candidate.children ? [...candidate.children] : [];
}

function fillValues(node: SceneNode): CandidateFill[] {
  const candidate = node as unknown as { fills?: unknown };
  if (!Array.isArray(candidate.fills)) return [];
  return candidate.fills
    .filter((fill): fill is { type: unknown; visible?: unknown } => Boolean(fill) && typeof fill === 'object')
    .map(fill => ({ type: String(fill.type), visible: typeof fill.visible === 'boolean' ? fill.visible : undefined }));
}

function toCandidateNode(node: SceneNode, nodes: Map<string, SceneNode>): CandidateNode {
  nodes.set(node.id, node);
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    width: node.width,
    height: node.height,
    visible: node.visible,
    fills: fillValues(node),
    children: childNodes(node).map(child => toCandidateNode(child, nodes)),
  };
}

function selectionMessage(): void {
  const selection = figma.currentPage.selection;
  const result = validateRootSelection(selection);
  if (!result.ok || !result.node || result.node.type !== 'FRAME') {
    post({ type: 'selection', valid: false, error: result.error });
    return;
  }
  post({
    type: 'selection',
    valid: true,
    frame: {
      id: result.node.id,
      name: result.node.name,
      width: result.node.width,
      height: result.node.height,
    },
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function exportSelection(scale: unknown): Promise<void> {
  if (!isPngScale(scale)) {
    post({ type: 'error', message: 'PNG scale must be 1x, 2x, 3x, or 4x.' });
    return;
  }
  const selection = figma.currentPage.selection;
  const result = validateRootSelection(selection);
  if (!result.ok || !result.node || result.node.type !== 'FRAME') {
    post({ type: 'error', message: result.error || 'Select exactly one root FRAME to export.' });
    return;
  }
  const root = result.node as FrameNode;
  const candidatesById = new Map<string, SceneNode>();
  const candidateTree = toCandidateNode(root, candidatesById);
  const candidates = collectAssetCandidates(candidateTree);
  const manifest = createExportManifest({
    pluginVersion: __PLUGIN_VERSION__,
    root: { id: root.id, name: root.name, width: root.width, height: root.height, type: 'FRAME' },
    scale,
    candidates,
  });
  const failures: ExportFailure[] = [];
  const assets: { node_id: string; bytes: Uint8Array }[] = [];
  try {
    post({ type: 'progress', message: 'Exporting raw Figma data…', completed: 0, total: candidates.length });
    const raw = await root.exportAsync({ format: 'JSON_REST_V1' });
    for (const [index, candidate] of candidates.entries()) {
      const source = candidatesById.get(candidate.node.id);
      if (!source) {
        failures.push({ node_id: candidate.node.id, name: candidate.node.name, reason: candidate.reason, message: 'The candidate source was not found.' });
        continue;
      }
      post({ type: 'progress', message: `Exporting asset ${index + 1} of ${candidates.length}…`, completed: index, total: candidates.length });
      try {
        const bytes = await source.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
        assets.push({ node_id: candidate.node.id, bytes });
      } catch (error) {
        failures.push({ node_id: candidate.node.id, name: candidate.node.name, reason: candidate.reason, message: errorMessage(error) });
      }
    }
    if (failures.length) {
      post({ type: 'error', message: `${failures.length} asset PNG export${failures.length === 1 ? '' : 's'} failed. No ZIP was created.`, failures });
      return;
    }
    post({ type: 'progress', message: 'Exporting full-frame reference PNG…', completed: candidates.length, total: candidates.length });
    const referencePng = await root.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
    post({ type: 'export-ready', manifest, raw, referencePng, assets, failures: [] });
  } catch (error) {
    post({ type: 'error', message: `Export failed: ${errorMessage(error)}`, failures });
  }
}

figma.showUI(__html__, { width: 380, height: 430, themeColors: true });
figma.on('selectionchange', selectionMessage);
figma.ui.onmessage = (message: { type?: string; scale?: PngScale }) => {
  if (message.type === 'get-selection') selectionMessage();
  if (message.type === 'export') void exportSelection(message.scale);
};
selectionMessage();
