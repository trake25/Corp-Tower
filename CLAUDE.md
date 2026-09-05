@AGENTS.md

# Claude Code adapter

`AGENTS.md` is the only policy, retrieval and close-out contract; this adapter
does not duplicate those rules.

Runtime-specific helpers under `.claude/skills/` may supplement execution, but
they do not own repository context. Semantic repository knowledge resolves only
through the KB Tree routed by `AGENTS.md`; no generated skill mirror exists.
Enable versioned hooks once per clone with `node scripts/install-git-hooks.mjs`.
