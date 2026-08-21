@AGENTS.md

# Claude Code adapter

Project skills are generated under `.claude/skills/` from the canonical
`.agents/skills/` tree. Edit only the canonical tree; the repository pre-commit
hook synchronizes and stages the mirror when a canonical skill is staged.
Enable versioned hooks once per clone with `node scripts/install-git-hooks.mjs`.
