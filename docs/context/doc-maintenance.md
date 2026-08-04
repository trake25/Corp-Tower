# Documentation Maintenance

Scope: the single source of the `/update-docs` procedure — the retention test, the doc-worthy gate, the banned constructions, and the budget rules. `.claude/commands/update-docs.md` is a pointer to this file and holds no steps of its own, so the procedure syncs to every machine by `git pull` and stays out of session-start context until a task actually needs it.

**Entry point:** [index.md](./index.md) is the always-load entry (system overview, working rules, task router, retrieval tiers, ignore map). It links out, never duplicates.

## The one rule that governs every doc edit

These docs are a **description of the system as it is now**, not a record of how it got here. Git holds the history; the KB holds the current state plus what a future session must not have to rediscover. Every `/update-docs` run therefore *replaces* prose — it never appends to it.

**Retention test.** A sentence stays only if it is one of three things:

1. **State** — current behavior, contract, number, term, or a file's role.
2. **Rework guard** — an alternative that was tried and failed, stated *with its failure mode*, so a future session doesn't retry it.
3. **Landmine** — a gotcha that bites the next person who edits that code.

Anything else is deleted: chronology, ordering of attempts, who found what, how many passes it took, what a thing "used to" be. If the code no longer does X, no sentence saying it once did X survives.

**Supersede-and-collapse.** When a decision is reversed, its entry is **not** given an addendum. Rewrite it down to the lesson that survives, or delete it outright. Losing the narrative is intended — `git log -p docs/context/` still has it.

**Banned constructions** (rewrite, don't soften): *used to · previously · originally · the first attempt · was later · since removed · then deleted · reverted · earlier version · several calibration passes · this pass*. State the current rule instead; if a failure is worth keeping under the retention test, render it as a single `**Rejected:** <option> → <failure>` line. `validate-docs.mjs` flags these.

**Net-line expectation.** A typical goal is 2–15 net lines across all docs. Adding more than 30 net lines to one doc means the session is being transcribed rather than the system documented — compress before finishing.

## Update procedure (`/update-docs`, diff-driven — never a full rebuild)

Runs in an isolated agent launched by `.claude/commands/update-docs.md`, from a change brief describing the confirmed goal. The brief carries intent, rejected alternatives, and renamed terms — things a diff cannot show. The diff is the authority on everything else; where the two disagree, the code wins.

**The order matters: the gate comes before any file is opened.** Steps 1–2 cost almost nothing, and most runs that should stop, stop there.

1. **Scope.** `node scripts/docs-scope.mjs`. It lists every changed path grouped by owning doc, marks new files, applies the ignore map, and names the primary doc. Its `UNMAPPED` list is routed by hand — then add a rule to its `ROUTES` table so the next run is automatic. This replaces reading [module-index.md](./module-index.md) for routing.

2. **Doc-worthy gate — apply before reading anything.** A change earns a doc edit only if it alters a **number, a wire contract, a rule, a file's role, a term, or a rationale a future session would otherwise re-litigate**. A pure refactor with none of those produces *no doc change* — say so, run validation, stop. Do not manufacture an entry to show work. Judge from the scope output and the brief; open a diff only where the gate is genuinely unclear.

3. **Read the diff, narrowly.** Only for paths that survived the gate, using the strategy `docs-scope.mjs` prints per path:
   - `full` — read the file in full (`Game_Config.js`: it encodes the numbers, and a missed hunk becomes a wrong doc).
   - `wide` — `git diff -U10 -- <path>`; escalate to a full read of that one module only if a hunk's contract stays ambiguous.
   - `hunk` — `git diff -U2 -- <path>`.

   An untouched file cannot have changed, so nothing is read "regardless". Never re-read the repo.

4. **Edit as replacement.** Apply the retention test to what you write *and* to what is already there. Read the **primary** doc in full and scan it for statements this diff just falsified — it is already in context, so this is free. For secondary docs, locate the owning entry with `grep -n '^#\{2,3\} '` and read only that range with `offset`/`limit`. Do not sweep docs you didn't otherwise need. Rationale → [decisions.md](./decisions.md); terms → [glossary.md](./glossary.md); message shapes → [networking.md](./networking.md); stack/rules → [index.md](./index.md).

5. **Validate.** `node scripts/validate-docs.mjs --quiet`; fix anything it reports as an error, re-running without `--quiet` for the detail.

6. **Receipt.** One line, e.g. `docs: gameplay.md, decisions.md (+4/−31) · validate PASS`. No delta report — `git diff` already has it. Commit only if explicitly instructed.

Whole-KB compaction (dedupe across docs, collapse superseded entries, work the blacklist backlog) is **not** part of this procedure — it is the separate, user-run `/compact-docs`.

## `decisions.md` entry shape

Entries there decay into stories faster than anywhere else, so they take a fixed shape, ~12 lines max:

```markdown
## <the current rule, stated as a rule>
**Now:** what the system does, one line.
**Why:** the constraint that forces it.
**Rejected:** <option> → <the failure that killed it>.
**Consequence:** what breaks if this is changed.
```

A decision genuinely spanning several mechanisms may add prose after `Consequence:`, but the four labelled lines come first and each stays one line.

## Validation and budgets

`scripts/validate-docs.mjs` runs after any doc edit. Hard errors (exit 1): broken links, dead anchors, and — for any doc **changed in this run that grew past its line budget** — over-budget and banned-phrase violations. The same violations in a doc you shrank or didn't touch are warnings only, so compaction is never blocked and growth always is. It also lists unresolved status markers (`Not yet verified`, `Known bug`, `TODO`, …) for a keep/resolve/delete call. `--quiet` drops the per-doc table and marker list on a passing run; a failing run always prints in full.

**Invariants:** exactly one owning doc per concept · every link and `#anchor` resolves · numeric defaults stated once and referenced · every doc within its budget · docs change only via `/update-docs` or `/compact-docs`.
