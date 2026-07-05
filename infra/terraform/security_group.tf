resource "aws_security_group" "staging" {
  name        = "corp-tower-${var.environment}"
  description = "Staging EC2 for Corp-Tower game server"

  ingress {
    description = "SSH from allowed CIDR"
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

  ingress {
    description = "WebSocket worker traffic from staging instances"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    self        = true
  }

  ingress {
    description = "Redis gateway from staging instances"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    self        = true
  }

  egress {
    description = "All outbound (ECR pull, updates)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "corp-tower-${var.environment}"
  }
}
