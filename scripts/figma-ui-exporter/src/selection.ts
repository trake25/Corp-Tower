import type { RootFrame } from './types';

export interface SelectionValidation<T extends { type: string }> {
  ok: boolean;
  node?: T;
  error?: string;
}

export function validateRootSelection<T extends { type: string }>(selection: readonly T[]): SelectionValidation<T> {
  if (selection.length === 0) return { ok: false, error: 'Select exactly one root FRAME to export.' };
  if (selection.length !== 1) return { ok: false, error: 'Select exactly one root FRAME to export; multiple nodes are selected.' };
  if (selection[0].type !== 'FRAME') return { ok: false, error: 'The selected node must be a FRAME.' };
  return { ok: true, node: selection[0] };
}

export function isRootFrame(value: unknown): value is RootFrame {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RootFrame>;
  return candidate.type === 'FRAME'
    && typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.width === 'number'
    && typeof candidate.height === 'number';
}
