---
role: "Cloud"
order: 1
headline: "Most teams either run everything like it's production, or run production like a hobby project. Knowing which is which is the actual engineering."
plain: "The game runs on two real foundations: a full production-grade AWS stack that only exists when someone's actually playing on it, and one physical machine at home that costs nothing extra and quietly serves the demo you're playing right now. Same container image on both — what's different is what each one is for, and what it costs to keep running."
tools:
  - "Terraform"
  - "AWS (EKS, EC2, ElastiCache)"
  - "Kubernetes"
  - "K3s"
  - "Docker"
  - "GitHub Actions"
  - "Cloudflare Tunnel"
details:
  - id: objectives
    title: "1 · What must be true, before any server exists"
    body: "Before any server existed, the real question was financial: what should this cost, and when does it actually need to be running at full strength? A production setup — load balancer, managed cache, servers that never sleep — has no free tier, so leaving one on all the time is an open-ended bill for a game that's still being built. The decision was to make the expensive version exist only for as long as someone is actually playing on it."
    evidence:
      label: "Why the expensive version only runs when someone's playing"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#eks-kept-session-scoped-not-always-on"
  - id: foundation
    title: "2 · Who's allowed to touch it"
    body: "Before writing any Terraform, the next question was who — and what — gets to touch this. Nobody holds a permanent AWS password: the automation proves who it is each time through a one-time identity check (OIDC) rather than a saved key, and a person's own control over the live servers comes from their own identity, not a shared file anyone could copy. That same rule — never hand out more access than the moment needs — turned out to matter just as much for the game's art files as it does for AWS."
    evidence:
      label: "The same rule, applied to something that isn't even AWS"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#private-asset-pipeline-credential-split"
  - id: environments
    title: "3 · Where it actually runs"
    body: "The two places this runs couldn't be more different, on purpose. One is the full AWS setup, built to prove the game holds up on real production infrastructure. The other is a physical machine at home, serving the exact demo you can play right now — no data centre, no monthly server bill, just hardware that was already sitting there. There's also a small always-on lab where changes get tried first, but it never serves a player directly. Keeping the home setup safe took its own decision: everything routes through a private tunnel (a Cloudflare Tunnel) instead of opening a port on the machine itself."
    evidence:
      label: "How a machine at home safely serves a public demo"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#physical-backup-dev-instances-and-demo-one-shared-tunnel"
  - id: guardrails
    title: "4 · It shuts itself off, on schedule"
    body: "AWS Budgets, the built-in spending alert, sounds reassuring — but it can lag up to a day to actually fire, too slow to be the thing stopping the spending. So the real guardrail isn't a warning, it's an action: a scheduled job that shuts the expensive setup down every night, whether anyone remembers to or not. And when it shuts down, it checks its own work against the real infrastructure directly, not just a label that might be lying about what's still running."
    evidence:
      label: "Checking the shutdown actually worked, not just trusting a label"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#eks-infra-destroy-verifies-orphans-against-live-ec2-not-the-tagging-api-alone"
  - id: resources
    title: "5 · Only paying for what the job needs"
    body: "Once it's decided what has to run and when, the next question is how big. The production setup gets real, managed pieces — a managed cache (AWS's ElastiCache, reached only over an encrypted connection) and servers spread across more than one part of the network — because the whole point is proving the design survives infrastructure it doesn't fully control. It also skips one extra piece entirely: no separate controller software just to connect the load balancer, since simpler wiring does the same job at this size."
    evidence:
      label: "What the production setup actually buys, piece by piece"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/deployment.md#eks-production-grade-target"
  - id: validation
    title: "6 · Checked before it's trusted"
    body: "Even a working setup gets a second look before it's trusted. One AWS default very nearly slipped through: attaching a custom security group — the setting that controls what's allowed to talk to what — quietly changes behaviour the moment you customise it, without ever throwing an error. The cluster can look perfectly healthy while that gap is open; it only shows up later, as small, hard-to-explain connection glitches. Catching it meant reviewing the design by hand, not just watching a plan approve cleanly."
    evidence:
      label: "The default that looks fine until it isn't"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#eks-node-security-group-must-carry-its-own-control-plane-and-self-referencing-rules"
  - id: automation
    title: "7 · Built so it repeats itself"
    body: "None of this stays correct by accident — the infrastructure is written as code (Terraform) so it can be rebuilt exactly, every time, with no manual step left for someone to forget. So a fix that's written down doesn't count as real until it's actually been applied: if the infrastructure code and what's actually running fall out of sync, the deploy stops itself before it can build on top of a fix nobody actually turned on."
    evidence:
      label: "The safeguard against a fix that was written but never applied"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#eks-deploy-workflows-fail-fast-on-infra-code-the-last-infra-apply-never-ran"
---
