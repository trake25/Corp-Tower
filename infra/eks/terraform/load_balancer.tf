data "aws_acm_certificate" "wildcard" {
  domain      = "*.galaxxigames.com"
  statuses    = ["ISSUED"]
  most_recent = true
}

resource "aws_lb" "main" {
  name               = "${local.cluster_name}-alb"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  idle_timeout       = 300

  tags = {
    Name = "${local.cluster_name}-alb"
  }
}

resource "aws_lb_target_group" "game" {
  name        = "${local.cluster_name}-game"
  port        = 30300
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = aws_vpc.main.id

  health_check {
    enabled             = true
    protocol            = "HTTP"
    path                = "/"
    matcher             = "426"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
  }

  tags = {
    Name = "${local.cluster_name}-game"
  }
}

resource "aws_lb_target_group" "web" {
  name        = "${local.cluster_name}-web"
  port        = 30310
  protocol    = "HTTP"
  target_type = "instance"
  vpc_id      = aws_vpc.main.id

  health_check {
    enabled             = true
    protocol            = "HTTP"
    path                = "/"
    matcher             = "200"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
  }

  tags = {
    Name = "${local.cluster_name}-web"
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = data.aws_acm_certificate.wildcard.arn

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Not Found"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "game" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.game.arn
  }

  condition {
    host_header {
      values = ["wstodplay.galaxxigames.com"]
    }
  }
}

resource "aws_lb_listener_rule" "web" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }

  condition {
    host_header {
      values = ["todplay.galaxxigames.com"]
    }
  }
}

resource "aws_autoscaling_attachment" "game" {
  autoscaling_group_name = aws_eks_node_group.server.resources[0].autoscaling_groups[0].name
  lb_target_group_arn    = aws_lb_target_group.game.arn
}

resource "aws_autoscaling_attachment" "web" {
  autoscaling_group_name = aws_eks_node_group.server.resources[0].autoscaling_groups[0].name
  lb_target_group_arn    = aws_lb_target_group.web.arn
}
