data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_security_group" "redis" {
  name        = "corp-tower-${var.environment}-redis"
  description = "Redis shared state for Corp Tower server pods"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description     = "Redis from staging server security group"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.staging.id]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "corp-tower-${var.environment}-redis"
  }
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "corp-tower-${var.environment}-redis"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "corp-tower-${var.environment}-redis"
  description                = "Corp Tower shared state Redis"
  engine                     = "redis"
  engine_version             = var.redis_engine_version
  node_type                  = var.redis_node_type
  num_cache_clusters         = 1
  automatic_failover_enabled = false
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  port                       = 6379
  security_group_ids         = [aws_security_group.redis.id]
  subnet_group_name          = aws_elasticache_subnet_group.redis.name

  tags = {
    Name = "corp-tower-${var.environment}-redis"
  }
}
