output "certificate_arn" {
  description = "Validated ACM wildcard certificate ARN, consumed by the session root via data \"aws_acm_certificate\"."
  value       = aws_acm_certificate_validation.wildcard.certificate_arn
}

output "domain_name" {
  description = "Domain the wildcard certificate covers."
  value       = var.domain_name
}
