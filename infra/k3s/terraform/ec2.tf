resource "aws_key_pair" "lab" {
  key_name   = "corp-tower-${var.environment}"
  public_key = var.ssh_public_key
}

locals {
  gateway_user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail
    dnf update -y
    dnf install -y python3 curl-minimal jq awscli iproute iptables-nft docker
    systemctl enable docker
    systemctl start docker
  EOF

  node_user_data = <<-EOF
    #!/bin/bash
    set -euo pipefail
    true
  EOF
}

resource "aws_instance" "gateway" {
  ami                         = data.aws_ami.amazon_linux_2023.id
  instance_type               = var.gateway_instance_type
  key_name                    = aws_key_pair.lab.key_name
  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.gateway.id]
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  associate_public_ip_address = true
  source_dest_check           = false
  user_data                   = local.gateway_user_data

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  lifecycle {
    ignore_changes = [
      ami,
      user_data,
    ]
  }

  tags = {
    Name = "corp-tower-${var.environment}-gw"
    Role = "k3s-gateway"
  }
}

resource "aws_instance" "control_plane" {
  ami                         = data.aws_ami.amazon_linux_2023.id
  instance_type               = var.control_plane_instance_type
  key_name                    = aws_key_pair.lab.key_name
  subnet_id                   = aws_subnet.private.id
  vpc_security_group_ids      = [aws_security_group.k3s_nodes.id]
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  associate_public_ip_address = false
  user_data                   = local.node_user_data

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  lifecycle {
    ignore_changes = [
      ami,
      user_data,
    ]
  }

  tags = {
    Name = "corp-tower-${var.environment}-cp"
    Role = "k3s-control-plane"
  }
}

resource "aws_instance" "agent" {
  count = var.agent_count

  ami                         = data.aws_ami.amazon_linux_2023.id
  instance_type               = var.agent_instance_type
  key_name                    = aws_key_pair.lab.key_name
  subnet_id                   = aws_subnet.private.id
  vpc_security_group_ids      = [aws_security_group.k3s_nodes.id]
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  associate_public_ip_address = false
  user_data                   = local.node_user_data

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  lifecycle {
    ignore_changes = [
      ami,
      user_data,
    ]
  }

  tags = {
    Name = "corp-tower-${var.environment}-agent-${count.index + 1}"
    Role = "k3s-agent"
  }
}
