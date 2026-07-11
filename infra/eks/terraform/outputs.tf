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

output "nlb_dns_name" {
  description = "Internet-facing NLB DNS name for game traffic."
  value       = aws_lb.game.dns_name
}

output "nlb_elastic_ips" {
  description = "Elastic IPs attached to the internet-facing NLB."
  value       = aws_eip.nlb[*].public_ip
}

output "game_target_group_arn" {
  description = "Target group for the future Kubernetes service/controller integration."
  value       = aws_lb_target_group.game.arn
}

output "redis_primary_endpoint" {
  description = "ElastiCache Redis primary endpoint."
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "ecr_repository_name" {
  description = "Existing ECR repository name used by Server EKS deploys."
  value       = data.aws_ecr_repository.server.name
}

output "server_eks_note" {
  description = "Parallel Server EKS topology note."
  value       = "EKS replaces private K3s EC2 nodes, NLB with Elastic IPs replaces EC2-GW Caddy, and ElastiCache replaces Docker Redis."
}
