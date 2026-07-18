# Server Docker Image

## Purpose
- Package the Node WebSocket server for staging deployment.
- File: `src/Server/Dockerfile`.

## Responsibilities
- Install server dependencies.
- Copy server source.
- Run `Server.js` in a container.
- Expose port `3000`.

## Key Logic
- Built in [[Server K3s Workflows]].
- Image is tagged with the immutable commit SHA.
- Pushed to ECR.
- Server K3s server pods reuse this same ECR image and repository.
- Worker deployment provides `REDIS_URL` and `RECONNECT_TTL_SECONDS`.
- Container healthchecks use a short staging interval so rolling deploy readiness is reported quickly.

## Inputs/Outputs
- Input: `src/Server` source, `package.json`, and `package-lock.json`.
- Output: Docker image in ECR.

## Dependencies
- Node runtime in Docker image.
- [[Server Entry]]
- [[Server K3s Workflows]]

## Notes
- Current staging deploy avoids local Docker requirement.
