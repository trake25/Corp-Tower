import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyQaFailure } from '../qa-gate.mjs';

test('QA classifies executable and host failures as tooling-environment', () => {
  assert.equal(classifyQaFailure({
    message: 'client smoke: spawn Godot ENOENT',
    error: Object.assign(new Error('spawn Godot ENOENT'), { code: 'ENOENT' }),
  }), 'tooling-environment');
  assert.equal(classifyQaFailure({ message: 'missing root Godot binary matching Godot_v*_linux.x86_64' }), 'tooling-environment');
});

test('QA keeps syntax and compile failures task-owned', () => {
  assert.equal(classifyQaFailure({ output: 'SyntaxError: Unexpected token }' }), 'implementation');
  assert.equal(classifyQaFailure({ output: 'Parse Error: Could not parse script.' }), 'implementation');
});

test('ordinary assertion failures remain task-owned by default', () => {
  const output = 'not ok 1 - scores remain stable\nAssertionError [ERR_ASSERTION]: expected 2 to equal 3';

  assert.equal(classifyQaFailure({ output }), 'implementation');
  assert.equal(classifyQaFailure({
    output,
    requestedClassification: 'test-expectation',
    evidence: 'Source and history prove the asserted value predates this task.',
  }), 'test-expectation');
});
