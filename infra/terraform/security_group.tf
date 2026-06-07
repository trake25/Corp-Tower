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

  ingress {
    description = "Redis gateway from staging instances"
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    self        = true
  }

  ingress {
    description = "k3s API from staging instances"
    from_port   = 6443
    to_port     = 6443
    protocol    = "tcp"
    self        = true
  }

  ingress {
    description = "k3s kubelet metrics from staging instances"
    from_port   = 10250
    to_port     = 10250
    protocol    = "tcp"
    self        = true
  }

  ingress {
    description = "k3s flannel VXLAN from staging instances"
    from_port   = 8472
    to_port     = 8472
    protocol    = "udp"
    self        = true
  }

  ingress {
    description = "k3s NodePort range from staging instances"
    from_port   = 30000
    to_port     = 32767
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
