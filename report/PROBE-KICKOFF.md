# Probe kickoff — paste this into a fresh session

Copy everything below the line into a **new Cowork session** on this folder.
Do not paste it into a session that has already read `docs/context/`.

Afterwards, take the agent's six answers and score them against the key in
[retrieval-probes.md](./retrieval-probes.md), then fill in the results table.
Do not show the agent that file.

---

I'm measuring how efficiently this repo's documentation routes to source code.
This is a **read-only measurement**. Do not edit any file.

**Rules:**
- Do NOT open anything under `plan/` or `report/` — they contain the answer key.
- Use the repo's normal documented retrieval path: `CLAUDE.md`, then
  `docs/context/`, then source.
- Answer the six questions **in order**, one at a time.
- Prefer the documented route over a repo-wide search. If you *do* fall back to a
  repo-wide grep because the docs didn't get you there, say so explicitly — that
  is the single most important thing I'm measuring.

**For each question report exactly:**
- `File:` the source file and the symbol or line you landed on
- `Route:` the files you opened, in order, to get there
- `Tokens:` rough total read, estimated as bytes ÷ 4
- `Hit:` one of —
  - `✓` landed first try via the documented route
  - `~` landed, but needed a second doc or a second lookup
  - `✗` had to fall back to a repo-wide search
  - `!` a doc claimed something the source contradicted

**The six questions:**

1. Where is the popover auto-close duration set?
2. Which file decides the colour of a brick's mood face?
3. Where is a debug-config key clamped and validated server-side?
4. What sets the client's snap radius, and where does the server re-validate that
   placement?
5. Which modules must change to add a new scoring event end-to-end?
6. Where is cross-pod room handoff implemented, and what breaks if the lease check
   is removed?

Finish with a summary table: question, file landed, tokens, hit.
