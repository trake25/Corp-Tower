output "aws_region" {
  description = "AWS region."
  value       = var.aws_region
}

output "cluster_name" {
  description = "EKS cluster name."
  value       = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  description = "EKS API endpoint."
  value       = aws_eks_cluster.main.endpoint
}

output "alb_dns_name" {
  description = "Internet-facing ALB DNS name; the two Cloudflare CNAMEs (wstodplay, todplay) point their content here each session."
  value       = aws_lb.main.dns_name
}

output "game_target_group_arn" {
  description = "ALB target group for corp-tower-server's NodePort (30300)."
  value       = aws_lb_target_group.game.arn
}

output "web_target_group_arn" {
  description = "ALB target group for corp-tower-web's NodePort (30310)."
  value       = aws_lb_target_group.web.arn
}

output "redis_url" {
  description = "TLS Redis URL for the EKS game server deployment (rediss://, ElastiCache in-transit encryption)."
  value       = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
}

output "ecr_repository_name" {
  description = "Existing ECR repository name used by Server EKS deploys."
  value       = data.aws_ecr_repository.server.name
}

output "server_eks_note" {
  description = "Parallel Server EKS topology note."
  value       = "EKS replaces private K3s EC2 nodes, an ALB with host-based routing replaces EC2-GW Caddy, and ElastiCache over TLS replaces in-cluster Redis."
}
