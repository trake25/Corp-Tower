resource "aws_security_group" "alb" {
  name        = "${local.cluster_name}-alb"
  description = "Public ALB ingress for Corp Tower game and web traffic."
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.cluster_name}-alb"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTPS/WSS traffic"
  from_port         = 443
  to_port           = 443
  ip_protocol       = "tcp"
  cidr_ipv4         = var.game_port_cidr
}

resource "aws_vpc_security_group_egress_rule" "alb_to_nodes" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Forward traffic to EKS node NodePorts"
  from_port                    = 30300
  to_port                      = 30311
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.nodes.id
}

resource "aws_security_group" "nodes" {
  name        = "${local.cluster_name}-nodes"
  description = "Corp Tower EKS worker nodes: ALB NodePort ingress, outbound to ElastiCache/ECR/STS via NAT."
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.cluster_name}-nodes"
  }
}

resource "aws_vpc_security_group_ingress_rule" "nodes_from_alb" {
  security_group_id            = aws_security_group.nodes.id
  description                  = "ALB health checks and traffic to game/web NodePorts"
  from_port                    = 30300
  to_port                      = 30311
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.alb.id
}

resource "aws_vpc_security_group_egress_rule" "nodes_outbound" {
  security_group_id = aws_security_group.nodes.id
  description       = "Node outbound (ECR, STS, ElastiCache, DNS via NAT)"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "nodes_from_nodes" {
  security_group_id            = aws_security_group.nodes.id
  description                  = "Node-to-node and cross-node pod-to-pod traffic (CoreDNS, VPC CNI)"
  ip_protocol                  = "-1"
  referenced_security_group_id = aws_security_group.nodes.id
}

resource "aws_vpc_security_group_ingress_rule" "cluster_from_nodes" {
  security_group_id            = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
  description                  = "Node kubelet to EKS control plane API (required for nodes to join)"
  from_port                    = 443
  to_port                      = 443
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.nodes.id
}

resource "aws_vpc_security_group_ingress_rule" "nodes_from_cluster" {
  security_group_id            = aws_security_group.nodes.id
  description                  = "EKS control plane to kubelet (logs, exec, webhooks, metrics-server)"
  from_port                    = 1025
  to_port                      = 65535
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
}

resource "aws_security_group" "redis" {
  name        = "${local.cluster_name}-redis"
  description = "ElastiCache Redis access from EKS worker nodes."
  vpc_id      = aws_vpc.main.id

  tags = {
    Name = "${local.cluster_name}-redis"
  }
}

resource "aws_vpc_security_group_ingress_rule" "redis_from_nodes" {
  security_group_id            = aws_security_group.redis.id
  description                  = "Redis from EKS worker nodes"
  from_port                    = 6379
  to_port                      = 6379
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.nodes.id
}

resource "aws_vpc_security_group_egress_rule" "redis_outbound" {
  security_group_id = aws_security_group.redis.id
  description       = "Redis outbound responses"
  ip_protocol       = "-1"
  cidr_ipv4         = var.vpc_cidr
}

