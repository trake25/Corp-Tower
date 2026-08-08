---
role: "Backend"
order: 4
hidden: true
headline: "The server decides everything; the phone only draws the result."
plain: "That's what lets someone lose signal on the bus, come back, and still be in the same game — served by a different worker than the one that started it."
tools:
  - "Node.js"
  - "Redis"
  - "WebSocket (ws)"
  - "Kubernetes"
details:
  - id: objectives
    title: "1 · The same math, every time"
    body: "Before this code was trusted, one rule was set and never relaxed: the tower-stability math cannot depend on anything except what's on the tower right now — no history, no memory of earlier turns, no randomness. That's what lets the exact same calculation be re-run thousands of times offline to tune the game, and re-derived instantly on reconnect instead of replayed step by step."
    evidence:
      label: "The rule that makes the same tower always grade the same way"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#tower-stability-must-stay-a-pure-function"
  - id: architecture
    title: "2 · One entrance, not five"
    body: "The gameplay rules aren't one big file — they're split into focused pieces for scoring, supply, and bonus logic. But nothing outside is allowed to reach into any of those pieces directly: every call, even between two of those pieces, goes back through one shared entry point. That's what keeps 'who's allowed to touch what' answerable in one sentence instead of traced through the whole codebase."
  - id: core_service
    title: "3 · A room follows its player"
    body: "A room isn't tied to the machine that created it. If the player who's actually connected is being answered by a different machine than the one running that room's game logic, the room hands that player off — quietly, automatically — so their signal always reaches whoever they're actually talking to. The player never has to know, or care, which machine that is."
  - id: performance
    title: "4 · No two writes collide"
    body: "Under light load, two machines picking players off the same waiting list one at a time never actually collide. Under real load, they can — and when they did, the fix couldn't be 'read the list, then rewrite it,' because two machines can both read the same list before either writes back, and one of them's change quietly disappears. The fix takes exactly what it needs in a single, indivisible step instead."
  - id: validation
    title: "5 · Proven to fail first, then proven fixed"
    body: "A fix like that doesn't get trusted just because it reads correctly. The regression test built for it does something stricter: it forces two machines to actually interleave their reads and writes the way real network timing would, runs the same scenario against the old, broken logic first to confirm it actually fails there, and only then checks it against the fix."
  - id: production_readiness
    title: "6 · Said out loud, not hidden"
    body: "Not everything gets built just because it could be. Long-term player history and a real leaderboard aren't there yet — only the state a live match actually needs is kept, and that's said plainly rather than implied by silence. What's missing is on the record as future work, not something a future session has to rediscover the hard way."
---
