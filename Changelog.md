# Changelog

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
