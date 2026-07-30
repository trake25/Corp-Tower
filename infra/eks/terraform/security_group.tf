resource "aws_security_group" "alb" {
  name        = "${local.cluster_name}-alb"
  description = "Public ALB ingress for Corp Tower game and web traffic."
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS/WSS traffic"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.game_port_cidr]
  }

  egress {
    description     = "Forward traffic to EKS node NodePorts"
    from_port       = 30300
    to_port         = 30311
    protocol        = "tcp"
    security_groups = [aws_security_group.nodes.id]
  }

  tags = {
    Name = "${local.cluster_name}-alb"
  }
}

resource "aws_security_group" "nodes" {
  name        = "${local.cluster_name}-nodes"
  description = "Corp Tower EKS worker nodes: ALB NodePort ingress, outbound to ElastiCache/ECR/STS via NAT."
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "ALB health checks and traffic to game/web NodePorts"
    from_port       = 30300
    to_port         = 30311
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Node outbound (ECR, STS, ElastiCache, DNS via NAT)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.cluster_name}-nodes"
  }
}

resource "aws_security_group" "redis" {
  name        = "${local.cluster_name}-redis"
  description = "ElastiCache Redis access from EKS worker nodes."
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis from EKS worker nodes"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.nodes.id]
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
