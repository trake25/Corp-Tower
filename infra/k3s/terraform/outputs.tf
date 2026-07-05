output "aws_region" {
  description = "AWS region."
  value       = var.aws_region
}

output "vpc_id" {
  description = "K3s lab VPC ID."
  value       = aws_vpc.lab.id
}

output "public_subnet_id" {
  description = "Public subnet for EC2-GW."
  value       = aws_subnet.public.id
}

output "private_subnet_id" {
  description = "Private subnet for K3s nodes."
  value       = aws_subnet.private.id
}

output "gateway_public_ip" {
  description = "EC2-GW public IPv4 address for SSH, Caddy, DuckDNS, and NAT."
  value       = aws_instance.gateway.public_ip
}

output "gateway_private_ip" {
  description = "EC2-GW private IPv4 address."
  value       = aws_instance.gateway.private_ip
}

output "control_plane_private_ip" {
  description = "Private IPv4 address for the K3s server/control plane."
  value       = aws_instance.control_plane.private_ip
}

output "agent_private_ips" {
  description = "Private IPv4 addresses for K3s agents."
  value       = aws_instance.agent[*].private_ip
}

output "node_private_ips" {
  description = "Private IPv4 addresses used by EC2-GW Caddy NodePort upstreams."
  value       = concat([aws_instance.control_plane.private_ip], aws_instance.agent[*].private_ip)
}

output "gateway_security_group_id" {
  description = "Security group ID for EC2-GW."
  value       = aws_security_group.gateway.id
}

output "k3s_nodes_security_group_id" {
  description = "Security group ID for private K3s nodes."
  value       = aws_security_group.k3s_nodes.id
}

output "ecr_repository_name" {
  description = "Existing ECR repository name used by K3s lab deploys."
  value       = data.aws_ecr_repository.server.name
}

output "learning_gateway_websocket_url" {
  description = "Godot client WebSocket URL for whichever lab stack currently owns DuckDNS."
  value       = "wss://${var.gateway_domain}"
}

output "k3s_lab_note" {
  description = "Cost-safe K3s lab topology note."
  value       = "EC2-GW simulates ALB/NLB, bastion, and NAT. K3s nodes are private. Managed EKS, ALB/NLB, and NAT Gateway are intentionally not used."
}
