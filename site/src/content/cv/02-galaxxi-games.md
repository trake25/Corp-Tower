---
role: "Indie Game Developer"
company: "Galaxxi Games (freelance)"
location: "Remote"
start: "Jan 2025"
end: "Present"
order: 2
summary: "Build games and the cloud infrastructure, delivery pipeline and release process behind them."
highlights:
  - "Built the full platform for Top or Drop: Terraform-managed AWS infrastructure, an authoritative Node.js WebSocket server on Redis shared state, and a Godot client — publicly playable, source public."
  - "Designed one GitHub Actions pipeline deploying to five destinations through shared composite actions; only development self-deploys on push, every other target clears a gate first."
  - "Established CI authentication with short-lived credentials through OIDC, not long-lived ones, plus per-environment credential isolation and encryption, tagging, quota and budget guardrails."
  - "Ran production, staging and development as separate targets with their own networking — the EKS path written and tested, held deploy-on-demand until release, while staging and development share one already-paid-for Linux machine reached through a Cloudflare Tunnel."
  - "Defined the entire platform as code so it can be destroyed and rebuilt from one source, with the deploy itself as the test — it halts before installing anything if the previous apply never completed."
  - "Shipped SpaceSheeps Pinball, live on Google Play since June 2025 — Godot 4 from prototype to release, with Play Sign-In, leaderboard and in-app donation APIs in Java/Kotlin."
