variable "aws_region" {
  description = "AWS region for the K3s lab."
  type        = string
  default     = "ap-southeast-1"
}

variable "environment" {
  description = "Environment name for the isolated K3s lab."
  type        = string
  default     = "k3s-lab"
}

variable "ssh_public_key" {
  description = "Public SSH key for EC2 access. Workflows use EC2_STAGING_SSH_PUBLIC_KEY or derive it from EC2_STAGING_SSH_KEY."
  type        = string

  validation {
    condition = can(regex(
      "^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|sk-ssh-ed25519@openssh.com|sk-ecdsa-sha2-nistp256@openssh.com)\\s+",
      trimspace(var.ssh_public_key)
    ))
    error_message = "ssh_public_key must be a non-empty OpenSSH public key. Set EC2_STAGING_SSH_PUBLIC_KEY or let the K3s workflows derive it from EC2_STAGING_SSH_KEY."
  }
}

variable "ssh_cidr" {
  description = "CIDR allowed to SSH to the K3s gateway bastion."
  type        = string
  default     = "0.0.0.0/0"
}

variable "game_port_cidr" {
  description = "CIDR allowed to reach the public K3s lab game gateway."
  type        = string
  default     = "0.0.0.0/0"
}

variable "gateway_domain" {
  description = "Public DNS name for the K3s lab WSS gateway."
  type        = string
  default     = "ws.tod.galaxxigames.com"
}

variable "ecr_repository_name" {
  description = "Existing ECR repository name used for Corp Tower server images."
  type        = string
  default     = "corp-tower-server-staging"
}

variable "vpc_cidr" {
  description = "CIDR block for the isolated K3s lab VPC. Avoid K3s default pod/service CIDRs."
  type        = string
  default     = "10.60.0.0/16"
}

variable "public_subnet_cidr" {
  description = "Public subnet CIDR for EC2-GW."
  type        = string
  default     = "10.60.1.0/24"
}

variable "private_subnet_cidr" {
  description = "Private subnet CIDR for K3s nodes."
  type        = string
  default     = "10.60.10.0/24"
}

variable "availability_zone" {
  description = "Optional exact availability zone for the one-AZ lab."
  type        = string
  default     = ""
}

variable "gateway_instance_type" {
  description = "Instance type for EC2-GW."
  type        = string
  default     = "t3.micro"
}

variable "control_plane_instance_type" {
  description = "Instance type for the private K3s server/control plane."
  type        = string
  default     = "t3.small"
}

variable "agent_instance_type" {
  description = "Instance type for private K3s agents."
  type        = string
  default     = "t3.micro"
}

variable "agent_count" {
  description = "Number of private K3s agent nodes."
  type        = number
  default     = 2

  validation {
    condition     = var.agent_count >= 1
    error_message = "agent_count must be at least 1."
  }
}
