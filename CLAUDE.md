@AGENTS.md

# Claude Code adapter

`AGENTS.md` is the universal repository execution policy.

The approved Phase 2 plan supplies all task-specific policy, compacted KB context, exact retrieval inputs, source context, implementation requirements, and verification for the current task. This adapter adds no domain, process, QA, or role instructions.

Repository/domain knowledge is selected through the KB Tree during planning rather than runtime-specific instruction packages.

Enable versioned Git hooks once per clone with `node scripts/install-git-hooks.mjs`.
