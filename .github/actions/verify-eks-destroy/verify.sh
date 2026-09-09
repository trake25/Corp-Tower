#!/usr/bin/env bash
# Cross-check Resources Tagging API results because its index can outlive a
# resource that has already been deleted.
set -euo pipefail

stack_tag="${1:?stack tag is required}"
AWS_OUTPUT=''

run_aws() {
  local status

  set +e
  AWS_OUTPUT="$(aws "$@" 2>&1)"
  status=$?
  set -e
  return "$status"
}

aws_verification_error() {
  local resource_api="$1"
  local diagnostic

  diagnostic="$(printf '%s' "$AWS_OUTPUT" | tr '\n' ' ' | cut -c1-500)"
  echo "::error::AWS verification error for ${resource_api}: ${diagnostic:-AWS CLI exited unsuccessfully}" >&2
  exit 1
}

has_expected_not_found() {
  local error_code="$1"
  [[ "$AWS_OUTPUT" == *"$error_code"* ]]
}

if ! run_aws resourcegroupstaggingapi get-resources \
  --tag-filters "Key=Stack,Values=${stack_tag}" \
  --output json; then
  aws_verification_error 'Resource Groups Tagging API get-resources'
fi
RESOURCES_JSON="$AWS_OUTPUT"

if ! ARNS_OUTPUT="$(printf '%s' "$RESOURCES_JSON" | jq -r '.ResourceTagMappingList[]?.ResourceARN')"; then
  AWS_OUTPUT='unable to parse Resource Groups Tagging API response'
  aws_verification_error 'Resource Groups Tagging API get-resources'
fi

ARNS=()
if [[ -n "$ARNS_OUTPUT" ]]; then
  mapfile -t ARNS <<<"$ARNS_OUTPUT"
fi
STILL_LIVE=()

for arn in "${ARNS[@]}"; do
  resource_part="${arn##*:}"
  rtype="${resource_part%%/*}"
  rid="${resource_part##*/}"

  case "$rtype" in
    natgateway)
      if run_aws ec2 describe-nat-gateways --nat-gateway-ids "$rid" \
        --query 'NatGateways[0].State' --output text; then
        state="$AWS_OUTPUT"
        if [[ -n "$state" && "$state" != 'deleted' && "$state" != 'None' ]]; then
          STILL_LIVE+=("$arn (state: $state)")
        fi
      elif ! has_expected_not_found 'InvalidNatGatewayID.NotFound'; then
        aws_verification_error "NAT gateway ${rid} describe-nat-gateways"
      fi
      ;;
    subnet)
      if run_aws ec2 describe-subnets --subnet-ids "$rid"; then
        STILL_LIVE+=("$arn")
      elif ! has_expected_not_found 'InvalidSubnetID.NotFound'; then
        aws_verification_error "subnet ${rid} describe-subnets"
      fi
      ;;
    security-group-rule)
      if run_aws ec2 describe-security-group-rules --security-group-rule-ids "$rid"; then
        STILL_LIVE+=("$arn")
      elif ! has_expected_not_found 'InvalidSecurityGroupRuleId.NotFound'; then
        aws_verification_error "security-group rule ${rid} describe-security-group-rules"
      fi
      ;;
    *)
      STILL_LIVE+=("$arn")
      ;;
  esac
done

if [[ "${#STILL_LIVE[@]}" -gt 0 ]]; then
  echo "::error::${#STILL_LIVE[@]} resource(s) tagged Stack=${stack_tag} are confirmed still live after destroy (M-8)."
  printf '%s\n' "${STILL_LIVE[@]}"
  exit 1
fi

if [[ "${#ARNS[@]}" -gt 0 ]]; then
  echo "Tagging-API index still lists ${#ARNS[@]} resource(s), but live EC2 lookups confirm all are actually gone. Destroy is clean."
else
  echo "No resources tagged Stack=${stack_tag} remain. Destroy is clean."
fi
