variable "aws_region" {
  description = "AWS region for staging resources."
  type        = string
  default     = "ap-southeast-1"
}

variable "environment" {
  description = "Environment name (staging only for now)."
  type        = string
  default     = "staging"
}

variable "github_repository" {
  description = "GitHub repo in owner/name form for OIDC trust."
  type        = string
  default     = "trake25/Corp-Tower"
}

variable "github_deploy_branches" {
  description = "Branches allowed to assume the GitHub Actions deploy role."
  type        = list(string)
  default     = ["main", "master"]
}

variable "ssh_public_key" {
  description = "Public SSH key for EC2 access (same key pair as GitHub EC2_STAGING_SSH_KEY secret)."
  type        = string
}

variable "ssh_cidr" {
  description = "CIDR allowed to SSH to staging EC2 (use your home IP/32 for tighter security)."
  type        = string
  default     = "0.0.0.0/0"
}

variable "game_port_cidr" {
  description = "CIDR allowed to reach WebSocket port 3000 on staging EC2."
  type        = string
  default     = "0.0.0.0/0"
}

variable "ecr_repository_name" {
  description = "ECR repository name for the game server image."
  type        = string
  default     = "corp-tower-server"
}

variable "instance_type" {
  description = "EC2 instance type for staging."
  type        = string
  default     = "t3.micro"
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type for shared matchmaking/session state."
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_engine_version" {
  description = "ElastiCache Redis engine version."
  type        = string
  default     = "7.1"
}
