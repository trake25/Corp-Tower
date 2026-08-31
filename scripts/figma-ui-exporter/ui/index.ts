import { zipSync } from 'fflate';
import { createPackageFiles } from '../src/package';
import { DEFAULT_PNG_SCALE, type ExportPackageManifest, type PackagePngAsset } from '../src/types';

interface SelectionMessage {
  type: 'selection';
  valid: boolean;
  error?: string;
  frame?: { id: string; name: string; width: number; height: number };
}

interface ProgressMessage {
  type: 'progress';
  message: string;
  completed: number;
  total: number;
}

interface Failure {
  node_id: string;
  name: string;
  reason: string;
  message: string;
}

interface ErrorMessage {
  type: 'error';
  message: string;
  failures?: Failure[];
}

interface ExportReadyMessage {
  type: 'export-ready';
  manifest: ExportPackageManifest;
  raw: unknown;
  referencePng: Uint8Array | ArrayBuffer | number[];
  assets: Array<{ node_id: string; bytes: Uint8Array | ArrayBuffer | number[] }>;
  failures: Failure[];
}

type PluginMessage = SelectionMessage | ProgressMessage | ErrorMessage | ExportReadyMessage;

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error('Exporter UI is incomplete.');
  return element;
}

const selection = requiredElement<HTMLParagraphElement>('#selection');
const scale = requiredElement<HTMLSelectElement>('#scale');
const exportButton = requiredElement<HTMLButtonElement>('#export');
const status = requiredElement<HTMLParagraphElement>('#status');
const failures = requiredElement<HTMLUListElement>('#failures');

scale.value = String(DEFAULT_PNG_SCALE);

function setStatus(message: string, state = ''): void {
  status.textContent = message;
  status.className = `status ${state}`.trim();
}

function setFailures(items: readonly Failure[] = []): void {
  failures.replaceChildren(...items.map(item => {
    const row = document.createElement('li');
    row.textContent = `${item.name} (${item.node_id}, ${item.reason}): ${item.message}`;
    return row;
  }));
}

function asBytes(value: Uint8Array | ArrayBuffer | number[]): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return Uint8Array.from(value);
}

function setBusy(value: boolean): void {
  exportButton.disabled = value;
  scale.disabled = value;
}

function downloadPackage(message: ExportReadyMessage): void {
  const assets: PackagePngAsset[] = message.assets.map(asset => ({ node_id: asset.node_id, bytes: asBytes(asset.bytes) }));
  const files = createPackageFiles({
    manifest: message.manifest,
    raw: message.raw,
    referencePng: asBytes(message.referencePng),
    assets,
  });
  const archive = zipSync(Object.fromEntries(files.map(file => [file.path, file.bytes])), { level: 6, mtime: new Date('1980-01-01T00:00:00Z') });
  const blob = new Blob([archive], { type: 'application/zip' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${message.manifest.screen.directory}-figma-phase1.zip`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

function handleMessage(message: PluginMessage): void {
  if (message.type === 'selection') {
    if (message.valid && message.frame) {
      selection.textContent = `${message.frame.name} · ${message.frame.width} × ${message.frame.height}`;
      setStatus('Ready to export.');
      return;
    }
    selection.textContent = message.error || 'Invalid selection.';
    setStatus('Select one root FRAME to continue.', 'error');
    return;
  }
  if (message.type === 'progress') {
    setBusy(true);
    setStatus(message.total ? `${message.message} ${message.completed}/${message.total}` : message.message);
    return;
  }
  if (message.type === 'error') {
    setBusy(false);
    setStatus(message.message, 'error');
    setFailures(message.failures);
    return;
  }
  if (message.type === 'export-ready') {
    try {
      downloadPackage(message);
      setStatus(`Downloaded ${message.manifest.screen.directory} with ${message.manifest.assets.length} asset PNG${message.manifest.assets.length === 1 ? '' : 's'}.`, 'success');
      setFailures(message.failures);
    } catch (error) {
      setStatus(`Could not create ZIP: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setBusy(false);
    }
  }
}

window.onmessage = event => {
  const message = event.data?.pluginMessage as PluginMessage | undefined;
  if (message) handleMessage(message);
};

exportButton.addEventListener('click', () => {
  setBusy(true);
  setFailures();
  setStatus('Preparing export…');
  parent.postMessage({ pluginMessage: { type: 'export', scale: Number(scale.value) } }, '*');
});

parent.postMessage({ pluginMessage: { type: 'get-selection' } }, '*');
