---
role: "QA"
order: 3
tags: ["QA"]
plain: "I work the way a QA engineer works with a developer — except the developer is an AI agent. I define what \"done\" means before work starts, it builds, I test and send it back with specifics, and we loop until nothing is outstanding. Only then does the documentation get updated."
---

**Decision.** A real QA↔developer loop with an agent in the implementer's seat. Same handoffs, same definition of done, same rejection path an org runs through a ticket system.

**Instead of** treating the agent as an oracle (fast, and nothing is judged against a requirement) or as autocomplete (safe, and it collapses back to writing everything yourself). Also rejected: writing docs alongside the code, which documents intentions rather than what shipped.

**For** the operator: a definition of done enforced by process, not by work feeling finished. The person who implemented something is the worst-placed person to judge whether it meets the requirement — and that stays true when the implementer is a model.

**Proof — the artifacts that make this a process, not a posture.** Documentation updates run only after a goal is confirmed reached, never speculatively, replacing prose rather than appending. CI gates are the automated acceptance criteria cleared before a human looks. Coverage gaps are written down as a known-issues register rather than quietly omitted. Invalid measurements are recorded so nobody re-runs them — *don't calibrate against collapse rate; the bots avoid collapsing columns, so it reads ~0% across wildly different settings.* And the multi-pod regression test was accepted only after being run against the pre-fix code and watched to fail.
