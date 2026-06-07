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
  description = "Staging EC2 public IP. Use as EC2_STAGING_HOST GitHub secret."
  value       = aws_instance.staging.public_ip
}

output "staging_ec2_instance_id" {
  description = "Staging EC2 instance ID."
  value       = aws_instance.staging.id
}

output "staging_ssh_user" {
  description = "SSH user for Amazon Linux 2023."
  value       = "ec2-user"
}

output "deprecated_production_note" {
  description = "Your original EC2 (Server-Update.yml) is unchanged by Terraform; do not delete until you migrate clients."
  value       = "Keep legacy EC2_HOST secrets for reference only. Point Godot to staging IP after deploy."
}

output "redis_primary_endpoint" {
  description = "ElastiCache Redis primary endpoint for REDIS_URL."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}
