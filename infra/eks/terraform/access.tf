resource "aws_eks_access_entry" "operator" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = var.operator_principal_arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "operator_admin" {
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = var.operator_principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  depends_on = [aws_eks_access_entry.operator]

  access_scope {
    type = "cluster"
  }
}

resource "aws_eks_access_entry" "automation" {
  count = var.ci_principal_arn == var.operator_principal_arn ? 0 : 1

  cluster_name  = aws_eks_cluster.main.name
  principal_arn = var.ci_principal_arn
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "automation_admin" {
  count = var.ci_principal_arn == var.operator_principal_arn ? 0 : 1

  cluster_name  = aws_eks_cluster.main.name
  principal_arn = var.ci_principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  depends_on = [aws_eks_access_entry.automation]

  access_scope {
    type = "cluster"
  }
}
