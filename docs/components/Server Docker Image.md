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
- Built in [[Server Staging Deploy Workflow]].
- Image is tagged with commit SHA and `staging`.
- Pushed to ECR.
- Docker worker containers run this image on EC2-2/EC2-3.
- Worker deployment provides `REDIS_URL` and `RECONNECT_TTL_SECONDS`.

## Inputs/Outputs
- Input: `src/Server` source and `package.json`.
- Output: Docker image in ECR.

## Dependencies
- Node runtime in Docker image.
- [[Server Entry]]
- [[Server Staging Deploy Workflow]]

## Notes
- Current staging deploy avoids local Docker requirement.
- EC2-1 gateway runs Redis/nginx containers, not the game server image.
