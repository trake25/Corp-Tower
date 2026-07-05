resource "aws_security_group" "gateway" {
  name        = "corp-tower-${var.environment}-gateway"
  description = "Public K3s lab gateway, bastion, Caddy, DuckDNS, and NAT instance"
  vpc_id      = aws_vpc.lab.id

  ingress {
    description = "SSH bastion from allowed CIDR"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_cidr]
  }

  ingress {
    description = "HTTP gateway for Caddy ACME challenge and redirect"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = [var.game_port_cidr]
  }

  ingress {
    description = "HTTPS/WSS game gateway"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.game_port_cidr]
  }

  egress {
    description = "All outbound for NAT, package updates, Caddy ACME, and DuckDNS"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "corp-tower-${var.environment}-gateway"
  }
}

resource "aws_security_group" "k3s_nodes" {
  name        = "corp-tower-${var.environment}-nodes"
  description = "Private K3s lab nodes"
  vpc_id      = aws_vpc.lab.id

  ingress {
    description     = "SSH from EC2-GW bastion"
    from_port       = 22
    to_port         = 22
    protocol        = "tcp"
    security_groups = [aws_security_group.gateway.id]
  }

  ingress {
    description     = "K3s API from EC2-GW bastion"
    from_port       = 6443
    to_port         = 6443
    protocol        = "tcp"
    security_groups = [aws_security_group.gateway.id]
  }

  ingress {
    description = "K3s API between private nodes"
    from_port   = 6443
    to_port     = 6443
    protocol    = "tcp"
    self        = true
  }

  ingress {
    description = "Kubelet API between private nodes"
    from_port   = 10250
    to_port     = 10250
    protocol    = "tcp"
    self        = true
  }

  ingress {
    description = "Flannel VXLAN between private nodes"
    from_port   = 8472
    to_port     = 8472
    protocol    = "udp"
    self        = true
  }

  ingress {
    description     = "Corp Tower NodePort from EC2-GW Caddy"
    from_port       = 30300
    to_port         = 30300
    protocol        = "tcp"
    security_groups = [aws_security_group.gateway.id]
  }

  egress {
    description = "All outbound through EC2-GW NAT route"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "corp-tower-${var.environment}-nodes"
  }
}
