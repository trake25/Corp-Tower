# Corp Tower experimental concept KB

`KB/` is a working parallel knowledge base for local concept-retrieval
experiments. It is tracked documentation, but it is not authoritative and is
not part of the default agent retrieval corpus.

The current production path remains:

`AGENTS.md → docs/context/index.md → docs/context prose → current locator maps`

The opt-in experimental path is:

`KB/docs/context/index.md → concept leaf → generated concept map → bounded source`

## Implemented tooling

- `node scripts/build-concept-map.mjs` parses authored concept metadata,
  resolves exact source anchors, writes ten domain maps, and replaces only the
  marked generated router block in `KB/docs/context/index.md`.
- `node scripts/build-concept-map.mjs --check --quiet` proves generated output
  is current without writing it.
- `node scripts/validate-concept-kb.mjs` validates identity, aliases, leaf
  ownership, adjacency, source grants, isolation, budgets, maps, and router
  equality independently from the primary KB validator.
- `node scripts/context.mjs concept-route <id-or-alias>` returns exact route,
  map, source-grant, and adjacency metadata.
- `concept-read` adds only the owning prose leaf. `concept-bundle` writes a
  bounded handoff under `.agent-state/automation/`. Neither traverses adjacent
  concepts automatically.
- `node scripts/benchmark-rag.mjs --concept-check` runs the parallel concept
  fixtures and records deterministic footprint metrics under ignored
  `.agent-state/automation/rag-benchmark/kb-context/`. The command without this
  option retains the legacy benchmark.
- `node scripts/export-kb-calibration-report.mjs` is the only public-report
  path. It manually exports the latest valid private snapshot to the next free
  version under non-context `report/benchmarks/kb-context/`; QA and task-close
  never invoke it.

## Authored metadata

A retrievable leaf is preceded by one canonical metadata block:

```md
<!-- kb
id: hud.tower.collapse.presentation
alias: collapse framing
source: src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd#_begin_collapse
adjacent: hud.tower.collapse.recovery
-->
## Collapse presentation
```

Concept IDs, aliases, source grants, and adjacency are authored only beside the
owning prose. Document ranges, map rows, source lines, router tables, and the
reverse source index are derived. Every ready concept has at least one exact
source grant; `#@file` migration seeds are rejected.

Concept source grants cannot enter `report/`, `repair/`, `plan/`, `task/`,
`reference/`, `.agent-state/`, or this `KB/` tree. Adjacency is a directed choice
for another explicit route call, never permission to load neighboring prose.

## Prose contract

One concept leaf owns one semantic responsibility. Its compact natural prose
should give an unfamiliar reader the behavior, subsystem mechanism, durable
rationale or invariant, and the negative ownership boundary needed before
source inspection. These ideas are not exposed as mandatory labels.

Prose does not narrate functions, inventory scenes/files, copy routine defaults,
record bug history, or duplicate another concept's full contract. A neighboring
contract is named only far enough to prevent wrong reasoning, then routed through
`adjacent:`. Maps own implementation locations and source owns exact detail.

## Experimental budgets

Concept capacity is independent from primary-KB prose limits. Above roughly
1,200 and 1,800 estimated tokens produce advisory and strong-advisory signals;
only prose above roughly 2,500 estimated tokens fails. Concept commands default
to a 16 KiB response and accept at most 32 KiB. The experimental Markdown line
ceiling remains 400 characters; primary `docs/context/**` limits are unchanged.

The concept benchmark measures prose, route/map, bounded source windows,
overlap-merged unique source windows, adjacency, and complete footprint for
representative concepts and authored journeys. Snapshots contain identities and
counts only—not source contents, prompts, responses, reasoning, transcripts,
environment data, secrets, or working-tree state. Footprints are calibration
observations rather than QA thresholds or automatic maintenance findings.

Primary locator-map anchor promotion consults a separately defined first-party
reference corpus. Experimental KB data, concept fixtures/tests, private state,
and reports cannot promote primary anchors, although concept tooling source remains
eligible for normal `map/infra.md` coverage.

Cloud ChatGPT/Claude activation and model/task-router redesign remain deferred.
