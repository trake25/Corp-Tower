resource "aws_lb" "game" {
  name               = "${local.cluster_name}-game"
  load_balancer_type = "network"
  internal           = false
  security_groups    = [aws_security_group.game_nlb.id]

  dynamic "subnet_mapping" {
    for_each = aws_subnet.public

    content {
      subnet_id     = subnet_mapping.value.id
      allocation_id = aws_eip.nlb[subnet_mapping.key].id
    }
  }

  tags = {
    Name = "${local.cluster_name}-game"
  }
}

resource "aws_lb_target_group" "game" {
  name        = "${local.cluster_name}-game"
  port        = 3000
  protocol    = "TCP"
  target_type = "ip"
  vpc_id      = aws_vpc.main.id

  health_check {
    enabled  = true
    protocol = "TCP"
    port     = "traffic-port"
  }

  tags = {
    Name = "${local.cluster_name}-game"
  }
}

resource "aws_lb_listener" "game_tls" {
  load_balancer_arn = aws_lb.game.arn
  port              = 443
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.game.arn
  }
}

