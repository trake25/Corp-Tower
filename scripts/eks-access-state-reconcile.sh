#!/usr/bin/env bash
# Reconcile only the configured EKS operator and CI access resources. This is
# not a general Terraform import facility: state is never removed or rewritten.
set -euo pipefail

: "${TF_VAR_environment:?TF_VAR_environment is required}"
: "${TF_VAR_operator_principal_arn:?TF_VAR_operator_principal_arn is required}"
: "${TF_VAR_ci_principal_arn:?TF_VAR_ci_principal_arn is required}"

cluster_name="corp-tower-${TF_VAR_environment}"
operator_principal_arn="$TF_VAR_operator_principal_arn"
ci_principal_arn="$TF_VAR_ci_principal_arn"
admin_policy_arn="arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
entry_address="aws_eks_access_entry.operator"
association_address="aws_eks_access_policy_association.operator_admin"
automation_entry_address="aws_eks_access_entry.automation[0]"
automation_association_address="aws_eks_access_policy_association.automation_admin[0]"

die() {
  echo "::error::EKS access-state reconciliation: $*" >&2
  exit 1
}

AWS_OUTPUT=''
AWS_STATUS=0

run_aws() {
  set +e
  AWS_OUTPUT="$(aws "$@" 2>&1)"
  AWS_STATUS=$?
  set -e
  return "$AWS_STATUS"
}

aws_not_found() {
  [[ "$AWS_OUTPUT" == *"ResourceNotFoundException"* || "$AWS_OUTPUT" == *"ClusterNotFoundException"* ]]
}

is_base_iam_principal_arn() {
  [[ "$1" =~ ^arn:aws:iam::[0-9]{12}:(role|user)/.+$ ]]
}

is_iam_role_arn() {
  [[ "$1" =~ ^arn:aws:iam::[0-9]{12}:role/.+$ ]]
}

is_base_iam_principal_arn "$operator_principal_arn" \
  || die "operator principal must be a base IAM role or user ARN"
is_iam_role_arn "$ci_principal_arn" \
  || die "CI principal must be a base IAM role ARN"

state_present=false
state_attributes=''

read_state_resource() {
  local address="$1"
  local resource_type="$2"
  local resource_name="$3"
  local instance_index="$4"
  local resources resource_count

  if ! resources="$(printf '%s' "$STATE_JSON" | jq -ce \
    --arg resource_type "$resource_type" \
    --arg resource_name "$resource_name" \
    --argjson instance_index "$instance_index" \
    '[.resources[]?
      | select(.mode == "managed" and .type == $resource_type and .name == $resource_name and (.module? // "") == "")
      | .instances[]?
      | select((.index_key? // null) == $instance_index)]')"; then
    die "could not inspect Terraform state for ${address}"
  fi
  resource_count="$(printf '%s' "$resources" | jq -r 'length')"
  if [[ "$resource_count" -gt 1 ]]; then
    die "state has multiple instances for ${address}; refusing ambiguous reconciliation"
  fi
  if [[ "$resource_count" -eq 0 ]]; then
    state_present=false
    state_attributes=''
    return
  fi

  state_attributes="$(printf '%s' "$resources" | jq -ce '.[0].attributes')" \
    || die "state record for ${address} has unreadable attributes"
  state_present=true
}

state_entry_is_expected() {
  local expected_principal="$1"

  printf '%s' "$state_attributes" | jq -e \
    --arg cluster "$cluster_name" \
    --arg principal "$expected_principal" \
    '.cluster_name == $cluster and .principal_arn == $principal and .type == "STANDARD"' >/dev/null
}

state_association_is_expected() {
  local expected_principal="$1"

  printf '%s' "$state_attributes" | jq -e \
    --arg cluster "$cluster_name" \
    --arg principal "$expected_principal" \
    --arg policy "$admin_policy_arn" \
    '(.cluster_name == $cluster and .principal_arn == $principal and .policy_arn == $policy)
     and ((.access_scope.type? // .access_scope[0]?.type? // "") == "cluster")' >/dev/null
}

assert_automation_state_absent() {
  local instance_count

  if ! instance_count="$(printf '%s' "$STATE_JSON" | jq -er '
    [.resources[]?
      | select(.mode == "managed" and (.type == "aws_eks_access_entry" or .type == "aws_eks_access_policy_association")
        and (.name == "automation" or .name == "automation_admin") and (.module? // "") == "")
      | .instances[]?] | length
  ')"; then
    die "could not inspect CI-specific Terraform state"
  fi
  if [[ "$instance_count" -ne 0 ]]; then
    die "CI-specific Terraform state exists although CI and operator principals are equal"
  fi
}

terraform init -input=false
if ! STATE_JSON="$(terraform state pull)"; then
  die "could not read Terraform state"
fi
if ! printf '%s' "$STATE_JSON" | jq -e 'type == "object" and (.resources | type == "array")' >/dev/null; then
  die "Terraform state is not a readable state document"
fi

read_state_resource "$entry_address" "aws_eks_access_entry" "operator" "null"
entry_in_state="$state_present"
if [[ "$entry_in_state" == true ]] && ! state_entry_is_expected "$operator_principal_arn"; then
  die "state identity for ${entry_address} does not match the configured cluster/principal/type"
fi

read_state_resource "$association_address" "aws_eks_access_policy_association" "operator_admin" "null"
association_in_state="$state_present"
if [[ "$association_in_state" == true ]] && ! state_association_is_expected "$operator_principal_arn"; then
  die "state identity for ${association_address} does not match the configured cluster/principal/policy/scope"
fi

ci_is_operator=false
ci_entry_in_state=false
ci_association_in_state=false
if [[ "$ci_principal_arn" == "$operator_principal_arn" ]]; then
  ci_is_operator=true
  assert_automation_state_absent
else
  read_state_resource "$automation_entry_address" "aws_eks_access_entry" "automation" "0"
  ci_entry_in_state="$state_present"
  if [[ "$ci_entry_in_state" == true ]] && ! state_entry_is_expected "$ci_principal_arn"; then
    die "state identity for ${automation_entry_address} does not match the configured cluster/principal/type"
  fi

  read_state_resource "$automation_association_address" "aws_eks_access_policy_association" "automation_admin" "0"
  ci_association_in_state="$state_present"
  if [[ "$ci_association_in_state" == true ]] && ! state_association_is_expected "$ci_principal_arn"; then
    die "state identity for ${automation_association_address} does not match the configured cluster/principal/policy/scope"
  fi
fi

if ! run_aws eks describe-cluster --name "$cluster_name" --output json; then
  if aws_not_found; then
    if [[ "$entry_in_state" == true ]]; then
      echo "EKS access entry: missing-live/restore-on-plan (cluster absent; no state removal)."
    else
      echo "EKS access entry: absent-for-create (cluster absent)."
    fi
    if [[ "$association_in_state" == true ]]; then
      echo "EKS admin association: missing-live/restore-on-plan (cluster absent; no state removal)."
    else
      echo "EKS admin association: absent-for-create (cluster absent)."
    fi
    if [[ "$ci_is_operator" == true ]]; then
      echo "EKS CI access: deduplicated through the operator principal."
    elif [[ "$ci_entry_in_state" == true ]]; then
      echo "EKS CI access entry: missing-live/restore-on-plan (cluster absent; no state removal)."
    else
      echo "EKS CI access entry: absent-for-create (cluster absent)."
    fi
    if [[ "$ci_is_operator" == false ]]; then
      if [[ "$ci_association_in_state" == true ]]; then
        echo "EKS CI admin association: missing-live/restore-on-plan (cluster absent; no state removal)."
      else
        echo "EKS CI admin association: absent-for-create (cluster absent)."
      fi
    fi
    exit 0
  fi
  die "AWS could not describe the configured EKS cluster; refusing reconciliation"
fi
if ! printf '%s' "$AWS_OUTPUT" | jq -e --arg cluster "$cluster_name" '.cluster.name == $cluster' >/dev/null; then
  die "AWS returned an unexpected cluster identity; refusing reconciliation"
fi

if run_aws eks describe-access-entry --cluster-name "$cluster_name" --principal-arn "$operator_principal_arn" --output json; then
  if ! printf '%s' "$AWS_OUTPUT" | jq -e --arg cluster "$cluster_name" --arg principal "$operator_principal_arn" \
    '.accessEntry.clusterName == $cluster and .accessEntry.principalArn == $principal and .accessEntry.type == "STANDARD"' >/dev/null; then
    die "live access entry does not match the configured cluster, principal, and STANDARD type"
  fi
  entry_live=true
elif aws_not_found; then
  entry_live=false
else
  die "AWS could not inspect the configured EKS access entry; refusing reconciliation"
fi

if [[ "$entry_in_state" == true && "$entry_live" == false ]]; then
  echo "EKS access entry: missing-live/restore-on-plan (state retained)."
elif [[ "$entry_in_state" == true ]]; then
  echo "EKS access entry: managed."
elif [[ "$entry_live" == true ]]; then
  terraform import "$entry_address" "${cluster_name}:${operator_principal_arn}"
  echo "EKS access entry: imported."
else
  echo "EKS access entry: absent-for-create."
fi

if run_aws eks list-associated-access-policies --cluster-name "$cluster_name" --principal-arn "$operator_principal_arn" --output json; then
  if ! associations="$(printf '%s' "$AWS_OUTPUT" | jq -ce --arg policy "$admin_policy_arn" '[.associatedAccessPolicies[]? | select(.policyArn == $policy)]')"; then
    die "AWS returned an unreadable access-policy association response"
  fi
  association_count="$(printf '%s' "$associations" | jq -r 'length')"
  if [[ "$association_count" -gt 1 ]]; then
    die "AWS returned multiple matching cluster-admin associations; refusing ambiguous reconciliation"
  fi
  if [[ "$association_count" -eq 1 ]]; then
    if ! printf '%s' "$associations" | jq -e '.[0].accessScope.type == "cluster"' >/dev/null; then
      die "live cluster-admin association does not have cluster-wide scope"
    fi
    association_live=true
  else
    association_live=false
  fi
else
  if aws_not_found; then
    association_live=false
  else
    die "AWS could not inspect the configured EKS admin association; refusing reconciliation"
  fi
fi

if [[ "$association_in_state" == true && "$association_live" == false ]]; then
  echo "EKS admin association: missing-live/restore-on-plan (state retained)."
elif [[ "$association_in_state" == true ]]; then
  echo "EKS admin association: managed."
elif [[ "$association_live" == true ]]; then
  terraform import "$association_address" "${cluster_name}#${operator_principal_arn}#${admin_policy_arn}"
  echo "EKS admin association: imported."
else
  echo "EKS admin association: absent-for-create."
fi

if [[ "$ci_is_operator" == true ]]; then
  echo "EKS CI access: deduplicated through the operator principal."
  exit 0
fi

if run_aws eks describe-access-entry --cluster-name "$cluster_name" --principal-arn "$ci_principal_arn" --output json; then
  if ! printf '%s' "$AWS_OUTPUT" | jq -e --arg cluster "$cluster_name" --arg principal "$ci_principal_arn" \
    '.accessEntry.clusterName == $cluster and .accessEntry.principalArn == $principal and .accessEntry.type == "STANDARD"' >/dev/null; then
    die "live CI access entry does not match the configured cluster, principal, and STANDARD type"
  fi
  entry_live=true
elif aws_not_found; then
  entry_live=false
else
  die "AWS could not inspect the configured EKS CI access entry; refusing reconciliation"
fi

if [[ "$ci_entry_in_state" == true && "$entry_live" == false ]]; then
  echo "EKS CI access entry: missing-live/restore-on-plan (state retained)."
elif [[ "$ci_entry_in_state" == true ]]; then
  echo "EKS CI access entry: managed."
elif [[ "$entry_live" == true ]]; then
  terraform import "$automation_entry_address" "${cluster_name}:${ci_principal_arn}"
  echo "EKS CI access entry: imported."
else
  echo "EKS CI access entry: absent-for-create."
fi

if run_aws eks list-associated-access-policies --cluster-name "$cluster_name" --principal-arn "$ci_principal_arn" --output json; then
  if ! associations="$(printf '%s' "$AWS_OUTPUT" | jq -ce --arg policy "$admin_policy_arn" '[.associatedAccessPolicies[]? | select(.policyArn == $policy)]')"; then
    die "AWS returned an unreadable EKS CI access-policy association response"
  fi
  association_count="$(printf '%s' "$associations" | jq -r 'length')"
  if [[ "$association_count" -gt 1 ]]; then
    die "AWS returned multiple matching CI cluster-admin associations; refusing ambiguous reconciliation"
  fi
  if [[ "$association_count" -eq 1 ]]; then
    if ! printf '%s' "$associations" | jq -e '.[0].accessScope.type == "cluster"' >/dev/null; then
      die "live CI cluster-admin association does not have cluster-wide scope"
    fi
    association_live=true
  else
    association_live=false
  fi
elif aws_not_found; then
  association_live=false
else
  die "AWS could not inspect the configured EKS CI admin association; refusing reconciliation"
fi

if [[ "$ci_association_in_state" == true && "$association_live" == false ]]; then
  echo "EKS CI admin association: missing-live/restore-on-plan (state retained)."
elif [[ "$ci_association_in_state" == true ]]; then
  echo "EKS CI admin association: managed."
elif [[ "$association_live" == true ]]; then
  terraform import "$automation_association_address" "${cluster_name}#${ci_principal_arn}#${admin_policy_arn}"
  echo "EKS CI admin association: imported."
else
  echo "EKS CI admin association: absent-for-create."
fi
