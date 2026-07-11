data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ecr_repository" "server" {
  name = var.ecr_repository_name
}

