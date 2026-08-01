---
role: "QA"
order: 3
tags: ["QA", "AI"]
headline: "The implementer never signs off on their own work — and that stays true when the implementer is a model."
plain: "I work with a coding agent the way a QA engineer works with a developer. I define what \"done\" means before work starts, it builds, I test and send it back with specifics, and we loop until nothing is outstanding. Only then does the documentation get updated."
metric: "0"
metricLabel: "self-certified merges"
links:
  - label: "testing.md — gates & known gaps"
    href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/testing.md"
  - label: "Multi-pod regression test"
    href: "https://github.com/trake25/Corp-Tower/blob/main/src/Server/tests/Matchmaking_Queue.test.js"
  - label: "decisions.md — rejected options"
    href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md"
---

### Decision

A real QA↔developer loop with an agent in the implementer's seat. Same handoffs, same definition of done, same rejection path an org runs through a ticket system.

### Instead of

**Treating the agent as an oracle** — fast, and nothing is judged against a requirement. Or **as autocomplete** — safe, and it collapses back to writing everything yourself. Also rejected: writing docs alongside the code, which documents intentions rather than what shipped.

### Why it matters

A definition of done enforced by process, not by work feeling finished. The person who implemented something is the worst-placed person to judge whether it meets the requirement. That doesn't stop being true because the implementer is a language model — if anything it's more true, because a model will argue that it's done with total confidence.

### Proof — the artifacts that make this a process, not a posture

- Documentation updates run only after a goal is confirmed reached, never speculatively, replacing prose rather than appending.
- CI gates are the automated acceptance criteria, cleared before a human looks.
- Coverage gaps live in a written known-issues register rather than being quietly omitted.
- Invalid measurements are recorded so nobody re-runs them — *don't calibrate against collapse rate; the bots avoid collapsing columns, so it reads ~0% across wildly different settings.*
- The multi-pod regression test was accepted only after being run against the pre-fix code and watched to fail.
