variable "aws_region" {
  description = "AWS region for the Server EKS stack."
  type        = string
  default     = "ap-southeast-1"
}

variable "environment" {
  description = "Environment name for the parallel Server EKS stack."
  type        = string
  default     = "eks-lab"
}

variable "ecr_repository_name" {
  description = "Existing ECR repository name used for Corp Tower server images."
  type        = string
  default     = "corp-tower-server-staging"
}

variable "vpc_cidr" {
  description = "CIDR block for the Server EKS VPC."
  type        = string
  default     = "10.70.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDRs for internet-facing load balancers."
  type        = list(string)
  default     = ["10.70.1.0/24", "10.70.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDRs for EKS nodes and ElastiCache."
  type        = list(string)
  default     = ["10.70.10.0/24", "10.70.11.0/24"]
}

variable "game_port_cidr" {
  description = "CIDR allowed to reach the public game load balancer."
  type        = string
  default     = "0.0.0.0/0"
}

variable "kubernetes_version" {
  description = "EKS control plane version. Must stay in AWS standard support (checked against the EKS version calendar at apply time) - extended support bills the control plane at 6x."
  type        = string
  default     = "1.34"
}

variable "eks_cluster_log_types" {
  description = "EKS control-plane log types to enable. Empty by default - CloudWatch log ingestion is usage-billed and the log group has no expiry unless Terraform-owned. Set to [\"api\"] for one debugging session; a retention_in_days=1 log group is created automatically when non-empty."
  type        = list(string)
  default     = []
}

variable "operator_principal_arn" {
  description = "IAM role/user ARN (not an assumed-role ARN) granted cluster-admin via an EKS access entry, so kubectl works from an operator's laptop."
  type        = string
}

variable "node_instance_types" {
  description = "EC2 instance types for the EKS managed node group."
  type        = list(string)
  default     = ["t3.small"]
}

variable "node_desired_size" {
  description = "Desired number of EKS worker nodes."
  type        = number
  default     = 2
}

variable "node_min_size" {
  description = "Minimum number of EKS worker nodes."
  type        = number
  default     = 1
}

variable "node_max_size" {
  description = "Maximum number of EKS worker nodes."
  type        = number
  default     = 3
}

variable "redis_node_type" {
  description = "ElastiCache Redis node type."
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_engine_version" {
  description = "ElastiCache Redis engine version."
  type        = string
  default     = "7.1"
}

