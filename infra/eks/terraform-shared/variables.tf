variable "aws_region" {
  description = "AWS region for the ACM certificate. Must be ap-southeast-1: regional ACM certs only attach to load balancers in the same region."
  type        = string
  default     = "ap-southeast-1"
}

variable "domain_name" {
  description = "Wildcard domain the persistent ACM certificate covers."
  type        = string
  default     = "*.galaxxigames.com"
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for galaxxigames.com, used for the one-time DNS validation record."
  type        = string
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with DNS edit scope on the zone, used for the one-time DNS validation record."
  type        = string
  sensitive   = true
}
