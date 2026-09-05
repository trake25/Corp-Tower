const JS_KEYWORD = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'do', 'else',
  'try', 'finally', 'typeof', 'await', 'new', 'delete', 'throw', 'constructor',
]);

function symbolsJs(lines) {
  const output = [];
  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const line = raw.replace(/\/\/.*$/, '');
    let match;
    if ((match = /^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(line)))
      return output.push({ ln: lineNumber, name: match[1], kind: 'class' });
    if ((match = /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(line)))
      return output.push({ ln: lineNumber, name: match[1], kind: 'fn' });
    if ((match = /^(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/.exec(line)))
      return output.push({ ln: lineNumber, name: match[1], kind: 'export' });
    if ((match = /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/.exec(line))) {
      if (/\brequire\s*\(/.test(line + (lines[index + 1] || ''))) return;
      return output.push({ ln: lineNumber, name: match[1], kind: 'const' });
    }
    if ((match = /^[ \t]{2,6}(?:static\s+)?(?:async\s+)?(?:\*\s*)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*\{\s*$/.exec(raw))) {
      if (!JS_KEYWORD.has(match[1])) return output.push({ ln: lineNumber, name: match[1], kind: 'method' });
    }
  });
  return output;
}

function symbolsGd(lines) {
  const output = [];
  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    let match;
    if ((match = /^class_name\s+([A-Za-z_]\w*)/.exec(raw))) return output.push({ ln: lineNumber, name: match[1], kind: 'class_name' });
    if ((match = /^signal\s+([A-Za-z_]\w*)/.exec(raw))) return output.push({ ln: lineNumber, name: match[1], kind: 'signal' });
    if ((match = /^const\s+([A-Za-z_]\w*)/.exec(raw))) {
      if (/\b(?:pre)?load\s*\(/.test(raw + (lines[index + 1] || ''))) return;
      return output.push({ ln: lineNumber, name: match[1], kind: 'const' });
    }
    if ((match = /^static\s+var\s+([A-Za-z_]\w*)/.exec(raw))) return output.push({ ln: lineNumber, name: match[1], kind: 'static var' });
    if ((match = /^@export(?:_\w+)?(?:\([^)]*\))?\s+var\s+([A-Za-z_]\w*)/.exec(raw)))
      return output.push({ ln: lineNumber, name: match[1], kind: 'export' });
    if ((match = /^(?:static\s+)?func\s+([A-Za-z_]\w*)/.exec(raw)))
      return output.push({ ln: lineNumber, name: match[1], kind: raw.startsWith('static') ? 'static func' : 'func' });
    if ((match = /^\t(?:static\s+)?func\s+([A-Za-z_]\w*)/.exec(raw)))
      return output.push({ ln: lineNumber, name: match[1], kind: 'func' });
  });
  return output;
}

function symbolsTerraform(lines) {
  return lines.flatMap((raw, index) => {
    const match = /^(resource|module|variable|output|data|provider)\s+"([^"]+)"(?:\s+"([^"]+)")?/.exec(raw);
    return match ? [{ ln: index + 1, name: match[3] ? `${match[2]}.${match[3]}` : match[2], kind: match[1] }] : [];
  });
}

function symbolsYaml(lines) {
  const output = [];
  let inJobs = false;
  lines.forEach((raw, index) => {
    let match;
    if ((match = /^([A-Za-z_][\w-]*):/.exec(raw))) {
      inJobs = match[1] === 'jobs';
      if (['jobs', 'on', 'runs', 'inputs', 'outputs'].includes(match[1])) output.push({ ln: index + 1, name: match[1], kind: 'key' });
      return;
    }
    if (inJobs && (match = /^ {2}([A-Za-z_][\w-]*):/.exec(raw))) output.push({ ln: index + 1, name: match[1], kind: 'job' });
  });
  return output;
}

function symbolsShell(lines) {
  return lines.flatMap((raw, index) => {
    const match = /^(?:function\s+)?([A-Za-z_]\w*)\s*\(\)\s*\{/.exec(raw);
    return match ? [{ ln: index + 1, name: match[1], kind: 'fn' }] : [];
  });
}

function symbolsScene(lines) {
  const nodes = [];
  let current = null;
  lines.forEach((raw, index) => {
    const node = /^\[node\s+name="([^"]+)"/.exec(raw);
    if (node) {
      current = { ln: index + 1, name: node[1], unique: false };
      nodes.push(current);
    } else if (current && /^unique_name_in_owner\s*=\s*true\s*$/.test(raw)) current.unique = true;
  });
  if (!nodes.length) return [];
  return [
    { ln: nodes[0].ln, name: nodes[0].name, kind: 'scene root' },
    ...nodes.filter(node => node.unique).map(node => ({ ln: node.ln, name: `%${node.name}`, kind: 'unique node' })),
  ];
}

export function extractSourceAnchors(path, text) {
  const lines = text.split(/\r?\n/);
  let symbols;
  if (path.endsWith('.tscn')) symbols = symbolsScene(lines);
  else if (path.endsWith('.gd')) symbols = symbolsGd(lines);
  else if (path.endsWith('.tf')) symbols = symbolsTerraform(lines);
  else if (path.endsWith('.yml') || path.endsWith('.yaml')) symbols = symbolsYaml(lines);
  else if (path.endsWith('.sh')) symbols = symbolsShell(lines);
  else symbols = symbolsJs(lines);
  return { lines: lines.length, symbols };
}
