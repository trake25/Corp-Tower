# Project Workflow:

# Rules
- For Sub AI, feed Prompt + Summary.md + Component.md first then provide .js or affected files when asked
- For Main AI, it only needs the prompt and sometimes remind to re-context Summary.md
- Sub AI can QA Main AI completed Tasks. Just provide Summary.md + Component.md + modified files.

# File Checklist by Task Type
## Any Task (always provide)
- Summary.md

## Server Logic Change (e.g. scoring rule, cooldown, game state)
- Summary.md
- Game Engine.md + Game_Engine.js
- Game Config.md + Game_Config.js (if tuning values involved)
- Server Entry.md + Server.js (if message routing changes)

## Matchmaking / Room / Bot Change
- Summary.md
- Lobby Manager.md + Lobby_Manager.js
- Bot Manager.md + Bot_Manager.js (if bot behavior involved)

## Client UI / Debug Menu Change
- Summary.md
- Main UI Controller.md + relevant .gd file
- NetworkManager.md + NetworkManager.gd (if message handling changes)

## New Message Type (client ↔ server)
- Summary.md
- Corp_Tower_TDD.md (message contracts)
- Server Entry.md + Server.js
- NetworkManager.md + NetworkManager.gd

## Infrastructure / Deploy Change (e.g. Redis, Kubernetes, new AWS resource)
- Summary.md
- Corp_Tower_TDD.md
- Server Staging Deploy Workflow.md + workflow .yml
- Terraform Infrastructure.md + relevant .tf files
- Staging Deploy Guide.md

## Android Pipeline Change
- Summary.md
- Client Android Internal Workflow.md + workflow .yml

## Documentation / MD Update Only
- Summary.md
- Target component .md only

# Sub AI prompt Structure
## Task
<one sentence: what to implement or fix>

## Context
<one sentence: why, or what triggered this task>

## Files Provided
- `filename.js` — <one phrase: what it does>
- `Component.md` — <one phrase: what it covers>

## Goal
- <bullet: specific expected output or behavior change>
- <bullet: if multiple outcomes expected>

## Constraints
- <bullet: from Summary.md or task-specific>
- Do not touch: <list components/files out of scope>

## Current State
<one or two sentences: what exists now, what's broken or missing>

## Expected Output
- <bullet: code change / new function / message type / etc.>
- Update affected `.md` file if behavior changes.