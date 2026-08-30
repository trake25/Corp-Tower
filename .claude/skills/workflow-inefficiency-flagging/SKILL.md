---
name: workflow-inefficiency-flagging
description: Judge a current-run repository workflow inefficiency only after the local candidate, model-family, high-effort, and already-required-turn gates pass.
---

# Workflow inefficiency flagging

Use only current-run evidence supplied by the host. Never read historical
telemetry or reports, and never create a provider turn for this skill.

Return at most three findings. Each needs an evidence event ID, stage, stable
issue and cause codes, separate severity and confidence, one observation, and
one scoped improvement. High token use alone is not inefficiency.

Keep the skill, evidence digest, and structured output within 1.5 KiB. Drop the
weakest finding if needed. A finding is review evidence; never change repository
workflow without human approval.

A single correctly handled maintenance blocker is not workflow inefficiency.
Flag only actual wasted effort in the current run, such as retries, repeated
verification, repeated tooling recovery, unnecessary rework, or repeated
retrieval expansion. Maintenance handoffs and workflow-inefficiency findings are
separate records.
