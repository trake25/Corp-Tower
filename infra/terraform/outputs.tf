output "aws_region" {
  description = "AWS region."
  value       = var.aws_region
}

output "ecr_repository_name" {
  description = "ECR repository name."
  value       = aws_ecr_repository.server.name
}

output "ecr_repository_url" {
  description = "ECR repository URL without tag. Use as ECR_REPOSITORY GitHub secret."
  value       = aws_ecr_repository.server.repository_url
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub OIDC. Use as AWS_ROLE_ARN GitHub secret."
  value       = aws_iam_role.github_actions.arn
}

output "staging_ec2_public_ip" {
  description = "Gateway EC2 public IP. Use as EC2_STAGING_HOST GitHub secret."
  value       = aws_instance.staging.public_ip
}

output "staging_ec2_instance_id" {
  description = "Gateway EC2 instance ID."
  value       = aws_instance.staging.id
}

output "worker_public_ips" {
  description = "Worker EC2 public IPs for Docker server containers."
  value       = aws_instance.worker[*].public_ip
}

output "worker_private_ips" {
  description = "Worker EC2 private IPs used by the gateway reverse proxy."
  value       = aws_instance.worker[*].private_ip
}

output "learning_gateway_websocket_url" {
  description = "Godot client WebSocket URL for the EC2 gateway reverse proxy."
  value       = "ws://${aws_instance.staging.public_ip}:3000"
}

output "staging_ssh_user" {
  description = "SSH user for Amazon Linux 2023."
  value       = "ec2-user"
}

output "learning_topology_note" {
  description = "Cost-safe learning topology note."
  value       = "EC2-1 simulates ALB/Redis/k3s gateway. EC2-2/3 simulate server pods as Docker workers. Managed AWS ElastiCache/ALB/EKS are intentionally not used."
}
