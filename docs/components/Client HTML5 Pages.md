# Client HTML5 Pages

## Purpose
- GitHub Actions entry point that builds and deploys the Godot client as a WebGL/HTML5 build.
- File: `.github/workflows/Client-HTML5-Pages.yml`.
- Paired teardown workflow: `.github/workflows/Client-HTML5-Undeploy.yml`.

## Workflow
- Trigger: manual `workflow_dispatch`.
- Input: `art_version_override` — optional, testing only (see [[Private Asset Pipeline]]).
- Runs on `ubuntu-24.04`.
- Calls `actions/configure-pages` with `enablement: true`, so a Pages site torn down by the undeploy workflow is recreated on the next deploy.

## Behavior
- Fetches private art into `Cor/Art` via the `fetch-private-assets` composite action before any Godot step ([[Private Asset Pipeline]]). The build fails closed if the bundle is missing, fails its hash, or is incomplete.
- Builds through the `build-godot-web` composite action, which downloads Godot `4.6.2.stable` plus matching Web export templates, applies the CI web export preset (`.github/godot/export_presets.web.ci.cfg`), imports headless, exports a Web release build, and writes a file size report to the job summary.
- Disables Jekyll processing on the exported output (`.nojekyll`).
- Uploads the exported `build/web` output as a GitHub Pages artifact and deploys it to the `github-pages` environment.
- Removes the fetched art from the runner in an `if: always()` step.

## Teardown
- `Client-HTML5-Undeploy.yml` is manual and requires typing `UNDEPLOY` to run, since it is destructive and outward-facing.
- `soft` (default) — deploys a minimal "build offline" page in place of the game. The Pages site keeps existing.
- `hard` — calls `DELETE /repos/{owner}/{repo}/pages`, removing the site so the URL returns 404.
- Redeploying is just running this workflow again.

## Scope
- Deploy target: GitHub Pages.
- Cloudflare Pages was evaluated and rejected. Cloudflare caps individual files at 25 MiB on every plan including paid; this project's `index.wasm` is 35.95 MiB. The cap applies to the stored file, so compression does not help, and Workers static assets carry the same limit. The only workaround would be serving the wasm from a public R2 bucket with a patched Godot loader, which was judged not worth the complexity. GitHub Pages allows 100 MB per file.
- Consequence: the deployed build is public to anyone with the URL — GitHub Pages has no access control. If invite-only playtesting becomes a requirement, itch.io supports restricted projects for free at this file size.

## Dependencies
- [[Godot Client App]]
- [[Private Asset Pipeline]]
- `.github/actions/build-godot-web`
- `.github/actions/fetch-private-assets`

## Notes
- The size report runs on every build regardless of deploy target; knowing the largest output file is what surfaced the Cloudflare constraint.
- Hard undeploy may require repo-admin rights beyond what the default `GITHUB_TOKEN` carries. The workflow reports a 403 explicitly and points at soft mode. Untested against the live repo — soft is the default for that reason.
