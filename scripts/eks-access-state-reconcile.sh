#!/usr/bin/env bash
# Reconcile only the configured EKS operator access resources. This is not a
# general Terraform import facility: state is never removed or rewritten.
set -euo pipefail

: "${TF_VAR_environment:?TF_VAR_environment is required}"
: "${TF_VAR_operator_principal_arn:?TF_VAR_operator_principal_arn is required}"

cluster_name="corp-tower-${TF_VAR_environment}"
principal_arn="$TF_VAR_operator_principal_arn"
admin_policy_arn="arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
entry_address="aws_eks_access_entry.operator"
association_address="aws_eks_access_policy_association.operator_admin"

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

state_present=false
state_attributes=''

read_state_resource() {
  local address="$1"
  local resources resource_count instance_count

  if ! resources="$(printf '%s' "$STATE_JSON" | jq -ce --arg address "$address" '[.resources[]? | select(.address == $address)]')"; then
    die "could not inspect Terraform state for ${address}"
  fi
  resource_count="$(printf '%s' "$resources" | jq -r 'length')"
  if [[ "$resource_count" -gt 1 ]]; then
    die "state has multiple records for ${address}; refusing ambiguous reconciliation"
  fi
  if [[ "$resource_count" -eq 0 ]]; then
    state_present=false
    state_attributes=''
    return
  fi

  instance_count="$(printf '%s' "$resources" | jq -r '.[0].instances | length')"
  if [[ "$instance_count" -ne 1 ]]; then
    die "state record for ${address} has ${instance_count} instances; refusing ambiguous reconciliation"
  fi
  state_attributes="$(printf '%s' "$resources" | jq -ce '.[0].instances[0].attributes')" \
    || die "state record for ${address} has unreadable attributes"
  state_present=true
}

state_entry_is_expected() {
  printf '%s' "$state_attributes" | jq -e \
    --arg cluster "$cluster_name" \
    --arg principal "$principal_arn" \
    '.cluster_name == $cluster and .principal_arn == $principal and .type == "STANDARD"' >/dev/null
}

state_association_is_expected() {
  printf '%s' "$state_attributes" | jq -e \
    --arg cluster "$cluster_name" \
    --arg principal "$principal_arn" \
    --arg policy "$admin_policy_arn" \
    '(.cluster_name == $cluster and .principal_arn == $principal and .policy_arn == $policy)
     and ((.access_scope.type? // .access_scope[0]?.type? // "") == "cluster")' >/dev/null
}

terraform init -input=false
if ! STATE_JSON="$(terraform state pull)"; then
  die "could not read Terraform state"
fi
if ! printf '%s' "$STATE_JSON" | jq -e 'type == "object" and (.resources | type == "array")' >/dev/null; then
  die "Terraform state is not a readable state document"
fi

read_state_resource "$entry_address"
entry_in_state="$state_present"
if [[ "$entry_in_state" == true ]] && ! state_entry_is_expected; then
  die "state identity for ${entry_address} does not match the configured cluster/principal/type"
fi

read_state_resource "$association_address"
association_in_state="$state_present"
if [[ "$association_in_state" == true ]] && ! state_association_is_expected; then
  die "state identity for ${association_address} does not match the configured cluster/principal/policy/scope"
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
    exit 0
  fi
  die "AWS could not describe the configured EKS cluster; refusing reconciliation"
fi
if ! printf '%s' "$AWS_OUTPUT" | jq -e --arg cluster "$cluster_name" '.cluster.name == $cluster' >/dev/null; then
  die "AWS returned an unexpected cluster identity; refusing reconciliation"
fi

if run_aws eks describe-access-entry --cluster-name "$cluster_name" --principal-arn "$principal_arn" --output json; then
  if ! printf '%s' "$AWS_OUTPUT" | jq -e --arg cluster "$cluster_name" --arg principal "$principal_arn" \
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
  terraform import "$entry_address" "${cluster_name}:${principal_arn}"
  echo "EKS access entry: imported."
else
  echo "EKS access entry: absent-for-create."
fi

if run_aws eks list-associated-access-policies --cluster-name "$cluster_name" --principal-arn "$principal_arn" --output json; then
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
  terraform import "$association_address" "${cluster_name}#${principal_arn}#${admin_policy_arn}"
  echo "EKS admin association: imported."
else
  echo "EKS admin association: absent-for-create."
fi
