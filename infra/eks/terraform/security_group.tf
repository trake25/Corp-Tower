resource "aws_security_group" "game_nlb" {
  name        = "${local.cluster_name}-game-nlb"
  description = "Public NLB ingress for Corp Tower WebSocket traffic."
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS/WSS game traffic"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.game_port_cidr]
  }

  egress {
    description = "Forward game traffic to private EKS nodes"
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = var.private_subnet_cidrs
  }

  tags = {
    Name = "${local.cluster_name}-game-nlb"
  }
}

resource "aws_security_group" "redis" {
  name        = "${local.cluster_name}-redis"
  description = "ElastiCache Redis access from EKS nodes."
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis from EKS cluster security group"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_eks_cluster.main.vpc_config[0].cluster_security_group_id]
  }

  egress {
    description = "Redis outbound responses"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = {
    Name = "${local.cluster_name}-redis"
  }
}

