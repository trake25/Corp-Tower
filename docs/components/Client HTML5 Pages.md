# Client HTML5 Pages

## Purpose
- GitHub Actions entry point that builds and deploys the Godot client as a WebGL/HTML5 build.
- File: `.github/workflows/Client-HTML5-Pages.yml`.

## Workflow
- Trigger: manual `workflow_dispatch`.
- Runs on `ubuntu-24.04`.
- Downloads Godot `4.6.2.stable` Linux plus matching Web export templates.

## Behavior
- Imports the Godot project headless, then exports a Web release build using the CI web export preset (`.github/godot/export_presets.web.ci.cfg`).
- Disables Jekyll processing on the exported output (`.nojekyll`).
- Uploads the exported `build/web` output as a GitHub Pages artifact and deploys it to the `github-pages` environment.

## Scope
- Current deploy target: GitHub Pages.
- Cloudflare is a planned future deploy target, not yet implemented in this workflow.

## Dependencies
- [[Godot Client App]]
