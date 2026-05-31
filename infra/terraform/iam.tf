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
    resources = [aws_ecr_repository.server.arn]
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

# GitHub Actions OIDC
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com"
  ]

  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759f0754e8381a0e0fc725241d0"
  ]
}

data "aws_iam_policy_document" "github_oidc_assume" {
  statement {
    effect = "Allow"
    actions = [
      "sts:AssumeRoleWithWebIdentity"
    ]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = concat(
        [
          for branch in var.github_deploy_branches :
          "repo:${var.github_repository}:ref:refs/heads/${branch}"
        ],
        [
          # Required when workflow jobs use `environment: staging` (GitHub OIDC sub changes).
          "repo:${var.github_repository}:environment:${var.environment}"
        ]
      )
    }
  }
}

resource "aws_iam_role" "github_actions" {
  name = "corp-tower-${var.environment}-github-actions"

  assume_role_policy = data.aws_iam_policy_document.github_oidc_assume.json
}

data "aws_iam_policy_document" "github_ecr_push" {
  statement {
    sid    = "EcrAuth"
    effect = "Allow"
    actions = [
      "ecr:GetAuthorizationToken"
    ]
    resources = ["*"]
  }

  statement {
    sid    = "EcrPush"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart"
    ]
    resources = [aws_ecr_repository.server.arn]
  }
}

resource "aws_iam_role_policy" "github_ecr_push" {
  name = "ecr-push"
  role = aws_iam_role.github_actions.id

  policy = data.aws_iam_policy_document.github_ecr_push.json
}
