data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_key_pair" "staging" {
  key_name   = "corp-tower-${var.environment}"
  public_key = var.ssh_public_key
}

locals {
  user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail
    dnf update -y
    dnf install -y docker aws-cli
    systemctl enable docker
    systemctl start docker
    usermod -aG docker ec2-user
  EOF
}

resource "aws_instance" "staging" {
  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.staging.key_name
  vpc_security_group_ids = [aws_security_group.staging.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  user_data              = local.user_data

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  tags = {
    Name = "corp-tower-${var.environment}-gateway"
    Role = "gateway-redis-proxy-k3s-learning"
  }
}

resource "aws_instance" "worker" {
  count = var.worker_count

  ami                    = data.aws_ami.amazon_linux_2023.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.staging.key_name
  vpc_security_group_ids = [aws_security_group.staging.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2.name
  user_data              = local.user_data

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  tags = {
    Name = "corp-tower-${var.environment}-worker-${count.index + 1}"
    Role = "docker-server-worker"
  }
}
