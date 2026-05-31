terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Optional: after bootstrap, uncomment and re-run terraform init -migrate-state
  # backend "s3" {
  #   bucket         = "corp-tower-tfstate-ap-southeast-1"
  #   key            = "staging/terraform.tfstate"
  #   region         = "ap-southeast-1"
  #   dynamodb_table = "corp-tower-tfstate-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "corp-tower"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
