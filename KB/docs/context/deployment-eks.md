# EKS Deployment

Scope: production AWS topology, infrastructure lifecycle, deployment operations, and EKS-specific live constraints.

<!-- kb
id: deploy.eks.topology
alias: EKS topology
alias: ALB NodePort
source: infra/eks/terraform/load_balancer.tf#aws_lb.main
source: infra/eks/terraform/eks.tf#aws_eks_node_group.server
-->
## Topology

Cloudflare DNS points to an ALB that terminates TLS and routes game/web traffic to instance-target NodePorts on an EKS managed node group. Game health accepts WebSocket upgrade-required behavior, and Redis is ElastiCache over TLS rather than an in-cluster Redis.

<!-- kb
id: deploy.eks.node-security
alias: EKS security group
alias: cross node DNS
source: infra/eks/terraform/security_group.tf#aws_vpc_security_group_ingress_rule.nodes_from_nodes
-->
## Node security groups

A custom launch-template security group replaces EKS's automatic node/control-plane wiring. The stack must explicitly permit node-to-control-plane HTTPS, control-plane-to-node ephemeral traffic, and node self-traffic. Missing self-traffic can surface only as intermittent cross-node DNS/network failures.

<!-- kb
id: deploy.eks.lifecycle
alias: EKS apply
alias: EKS destroy
alias: auto destroy
source: .github/workflows/EKS-Infra-Apply.yml#apply
source: .github/workflows/EKS-Infra-Destroy.yml#destroy
source: .github/workflows/EKS-Infra-Auto-Destroy.yml#auto-destroy
adjacent: deploy.shared.terraform-roots
-->
## Infrastructure lifecycle

The EKS application stack is session-scoped and incurs real hourly cost. Apply/destroy operations are explicit, and scheduled auto-destroy is the control that bounds unattended cost. Deployment workflows do not implicitly apply Terraform.

<!-- kb
id: deploy.eks.applied-tree
alias: verify-infra
alias: applied tree hash
source: .github/workflows/EKS-Infra-Apply.yml#Record applied infra tree
source: .github/workflows/EKS-Deploy-Game-Server.yml#verify-infra
-->
## Applied-tree guard

A committed infrastructure fix is not a deployment precondition until the infrastructure has actually been applied from that tree. The apply workflow records the applied tree identity and deploy verifies it before build/deploy work.

<!-- kb
id: deploy.eks.destroy-verification
alias: Tagging API lag
alias: orphan check
source: .github/workflows/EKS-Infra-Destroy.yml#Check for orphaned billable resources
-->
## Destroy verification

AWS resource-discovery APIs may report recently deleted resources after deletion. Post-destroy checks must cross-verify indexed ARNs against live service describe calls rather than assuming repeated index queries converge immediately.

<!-- kb
id: deploy.eks.workflows
alias: EKS deploy
source: .github/workflows/EKS-Deploy-Game-Server.yml#deploy-eks
adjacent: testing.release.gates
-->
## Deployment workflows

EKS deploy verifies infrastructure, runs the target's release tests, builds/pushes artifacts, updates cluster credentials, applies runtime manifests, updates DNS, and performs target smoke checks. Game deployment additionally verifies Redis transport/connection health and long-lived WebSocket behavior.

<!-- kb
id: deploy.eks.dns
alias: CNAME wait
alias: ALB DNS
source: .github/workflows/EKS-Deploy-Game-Server.yml#Update Cloudflare CNAME content
-->
## DNS update

After ALB/DNS changes, deploy waits for the public hostname to resolve to the new target while failing immediately if the ALB's own DNS name has no addresses. This distinguishes propagation delay from a broken load balancer.

<!-- kb
id: deploy.eks.manual-setup
alias: EKS manual setup
source: .github/workflows/EKS-Shared-Infra-Apply.yml#apply
-->
## Operator setup

Certain prerequisites require a human/operator identity and cannot be self-granted by CI: IAM permissions, budget alerts, operator principal authorization, and initial shared-infrastructure apply. Repository automation must fail or instruct rather than pretending it can bootstrap privileges it does not have.
