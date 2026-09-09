import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const VERIFIER = resolve('.github/actions/verify-eks-destroy/verify.sh');

const fakeAws = String.raw`#!/usr/bin/env bash
set -eu

scenario="$AWS_VERIFY_SCENARIO"
resource_arn() {
  printf '%s' "arn:aws:ec2:ap-southeast-1:123456789012:$1/$2"
}

if [[ "$1" == resourcegroupstaggingapi ]]; then
  case "$scenario" in
    live|nat-not-found) arn="$(resource_arn natgateway nat-123)" ;;
    subnet-not-found|access-denied) arn="$(resource_arn subnet subnet-123)" ;;
    security-group-rule-not-found) arn="$(resource_arn security-group-rule sgr-123)" ;;
  esac
  printf '{"ResourceTagMappingList":[{"ResourceARN":"%s"}]}\n' "$arn"
  exit 0
fi

case "$scenario" in
  live)
    printf 'available\n'
    ;;
  nat-not-found)
    printf 'An error occurred (InvalidNatGatewayID.NotFound) when calling the DescribeNatGateways operation: The natGateway ID does not exist\n' >&2
    exit 254
    ;;
  subnet-not-found)
    printf 'An error occurred (InvalidSubnetID.NotFound) when calling the DescribeSubnets operation: The subnet ID does not exist\n' >&2
    exit 254
    ;;
  security-group-rule-not-found)
    printf 'An error occurred (InvalidSecurityGroupRuleId.NotFound) when calling the DescribeSecurityGroupRules operation: The rule ID does not exist\n' >&2
    exit 254
    ;;
  access-denied)
    printf 'An error occurred (AccessDenied) when calling the DescribeSubnets operation: User is not authorized\n' >&2
    exit 254
    ;;
esac
`;

function verify(scenario) {
  const fixture = mkdtempSync(join(tmpdir(), 'corp-verify-eks-destroy-'));
  const aws = join(fixture, 'aws');
  writeFileSync(aws, fakeAws);
  chmodSync(aws, 0o755);
  try {
    return spawnSync('bash', [VERIFIER, 'server-eks'], {
      cwd: resolve('.'),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixture}:${process.env.PATH}`,
        AWS_VERIFY_SCENARIO: scenario,
      },
    });
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
}

test('confirmed live tagged resources remain a hard failure', () => {
  const result = verify('live');

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /confirmed still live after destroy/);
  assert.match(result.stdout, /nat-123 \(state: available\)/);
});

test('stale NAT gateway tag entries with the expected not-found error pass', () => {
  const result = verify('nat-not-found');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Tagging-API index still lists 1 resource/);
});

test('stale subnet and security-group-rule tag entries with expected not-found errors pass', () => {
  for (const scenario of ['subnet-not-found', 'security-group-rule-not-found']) {
    const result = verify(scenario);
    assert.equal(result.status, 0, `${scenario}: ${result.stderr}`);
    assert.match(result.stdout, /Destroy is clean/, scenario);
  }
});

test('unexpected AWS lookup errors fail as verification errors', () => {
  const result = verify('access-denied');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /AWS verification error for subnet subnet-123 describe-subnets/);
  assert.match(result.stderr, /AccessDenied/);
  assert.doesNotMatch(result.stdout, /Destroy is clean/);
});
