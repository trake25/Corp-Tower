# Corp Tower — *Top or Drop*

A 3-player mobile puzzle game where you build one tower together and compete for
the points while you do it. **In development, with a playable demo** — not a
shipped product.

## The game, plainly

Three players share one tower. Every level has a height the team has to reach
together, and the game hands out blocks at random — you don't get to rotate
them, so what you're given is what you place. Drop it on the tower and it falls
to whatever it lands on, exactly like the real thing.

The catch: **there are only so many points of height in a level, and you're all
racing for the same ones.** Build fast and greedily and the tower goes crooked,
which pays you less and eventually collapses. Steady the tower instead and you
get paid for that too. And if any single player hasn't done their share by the
end of the level, *everyone* rolls back and repeats it.

So it's cooperative and selfish at the same time. That tension is the game.

## What the orchestrator did

Almost none of this code was typed by hand. It was **directed** — and directing
an AI coding agent well is a different job from writing the code yourself:

- **Decide before building.** Requirements, cost ceiling, security guardrails
  and the exact expected results are written down *before* any planning starts.
  A guardrail added afterwards is a rewrite.
- **Brief, don't dump.** The agent never reads the whole repository. An indexed
  router (`docs/context/index.md`) names the handful of documents a task
  actually needs, and only those get loaded.
- **Match the model to the task.** Cheap assistant for research and prompt
  trimming; the expensive model only where the work is genuinely hard. Most of
  the cost of AI development is paying full price for easy work.
- **Approve, then implement.** The agent produces a plan; nothing gets built
  until that plan has been read and approved.
- **Keep judgement separate from authorship.** The agent builds and fixes; it
  never decides whether the result is acceptable. Whoever wrote the expected
  results does that.

The result is a system with real edges to it: an authoritative server (the phone
only draws what the server says), tower-stability math kept deliberately
deterministic so it can be re-simulated thousands of times to balance the game,
sessions that survive losing signal on the bus, and one CI/CD pipeline serving
five deployment destinations where only the development one is trusted to
deploy itself.

## How it's put together

| Piece | Stack |
|---|---|
| Client | Godot 4.6 (Android + Web), GDScript |
| Server | Node.js, WebSocket, Redis — server is authoritative |
| Infra | Terraform · EKS (on demand) · K3s lab · Docker · Cloudflare |
| CI/CD | GitHub Actions — 5 destinations, one shared pipeline |

## Links

- **Portfolio write-up:** <https://enportfolio.galaxxigames.com> — the
  engineering behind this, one card per discipline
- **Playable demo:** <https://toddemo.galaxxigames.com>
- **How the codebase is documented:** [`docs/context/index.md`](docs/context/index.md)

> The repo keeps the working name **Corp-Tower**; the game is presented as
> **Top or Drop (TOD)**. Same project.
