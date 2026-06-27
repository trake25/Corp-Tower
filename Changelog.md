# Changelog

## 2026-06-20
- docs: Added a manual, phase-gated K3s learning plan with proof checks and rollback paths for each implementation step.

## 2026-06-15
- checkpoint: Added shape-based fixed-orientation blocks, tower stack rendering in the Godot gameplay HUD, and `towerBlocks` history in `game_state`; balance now needs recalibration because non-vertical shapes can reduce available height.
- checkpoint: Added bot-aware Godot auto-reconnect for unintended disconnects in real-player-only rooms, exposed `isBot` in `game_state.players`, and changed staging server update to drain/update workers one at a time through nginx.
- update: `Staging Automated Master` now runs automatically on server-side pushes to `main`/`master`, while client-only pushes do not trigger staging deploys.
- feature: Added `Staging Automated Master` workflow to queue `Diagnostics -> Infra Plan -> Server Update`.
- update: `Staging Infra Plan` now fails on Terraform create/delete/replace actions so the automated path cannot silently create or destroy infrastructure.
- update: Removed legacy k3s-uninstall actions from `Staging Server Update`; k3s is out of the active deployment path.
- checkpoint: Reverted staging to the pre-k3s Docker worker path; Diagnostics, Infra Plan, Infra Apply, Cleanup, and Server Update all succeeded, and the Godot client can play against staging.
- update: Staging runtime cleanup now matches Server Update output: Corp Tower Docker containers, Docker network, optional server/nginx/redis images, and temporary deployment files only.
- update: Added/fixed manual staging diagnostics, infrastructure plan/apply, cleanup, and server update workflows with deterministic SSH known_hosts setup.
- update: Added manual staging runtime cleanup workflow and same-subnet EC2 guardrails.
- fix: Reverted staging deployment from k3s back to Docker workers behind the EC2 gateway.

## 2026-06-07
- update: Codex plus implemented a simulated LB, Redis, k3s.

## 2026-06-06
- update: Claude reformatted `Corp_Tower_GDD.md` and `Corp_Tower_TDD.md` to match `Summary.md` style with Obsidian `[[links]]` and cross-references.
- update: Claude added `[[Corp_Tower_GDD]]` and `[[Corp_Tower_TDD]]` links to `Summary.md` Architecture Tree and Fast Start For AI sections.
- fix: Codex linked `AI_Agent_Organization.md` from `Summary.md` for Obsidian graph navigation.
- update: Codex added `AI_Agent_Organization.md` for AI assistant roles and collaboration rules.
- update: Added Obsidian-compatible `Summary.md`, component notes, and `Changelog.md`.
- update: Updated `README.md` to point readers to `Summary.md`.
- update: Added `.obsidian/` to `.gitignore`.

## 2026-05-31
- update: Added staging deploy documentation for Docker, ECR, Terraform, and GitHub Actions.
- refactor: Deprecated legacy `Server-Update.yml` in favor of staging Docker deploy workflow.

## 2026-05-27
- feature: Added server debug config broadcast so all clients sync debug menu changes.
- fix: Added room teardown on real player disconnect; bots/timers stop and session scores reset.
- feature: Added manual Android internal testing workflow scaffold.
- update: Updated local GDD/TDD policy earlier; current policy is docs update only when manually requested.
