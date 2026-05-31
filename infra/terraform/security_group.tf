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
    description = "WebSocket game server"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = [var.game_port_cidr]
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
