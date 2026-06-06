# Legacy Server Update Workflow

## Purpose
- Disabled reference workflow for old EC2 git-pull deployment.
- File: `.github/workflows/Server-Update.yml`.

## Responsibilities
- Preserve old deployment idea for reference.
- Fail immediately if manually run.
- Direct users to [[Server Staging Deploy Workflow]].

## Key Logic
- Trigger: manual only.
- Job prints deprecation notice and exits with failure.

## Inputs/Outputs
- Input: manual workflow run.
- Output: deprecation error.

## Dependencies
- [[Server Staging Deploy Workflow]]
- [[Staging Deploy Guide]]

## Notes
- Do not use for active deployment.
- Legacy EC2 secrets may still exist but are not part of the preferred staging path.
