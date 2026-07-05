data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "ec2_ecr_pull" {
  statement {
    sid    = "EcrAuth"
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken"
    ]
    resources = ["*"]
  }

  statement {
    sid    = "EcrPull"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage"
    ]
    resources = [data.aws_ecr_repository.server.arn]
  }
}

resource "aws_iam_role" "ec2" {
  name = "corp-tower-${var.environment}-ec2"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "ec2_ecr_pull" {
  name = "ecr-pull"
  role = aws_iam_role.ec2.id

  policy = data.aws_iam_policy_document.ec2_ecr_pull.json
}

resource "aws_iam_instance_profile" "ec2" {
  name = "corp-tower-${var.environment}-ec2"
  role = aws_iam_role.ec2.name
}
