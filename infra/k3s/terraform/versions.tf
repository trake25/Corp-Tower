terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket       = "corp-tower-tfstate-ap-southeast-1"
    key          = "k3s-lab/terraform.tfstate"
    region       = "ap-southeast-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "corp-tower"
      Environment = var.environment
      Stack       = "k3s-lab"
      ManagedBy   = "terraform"
    }
  }
}
