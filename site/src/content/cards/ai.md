---
role: "AI"
order: 6
tags: ["AI"]
plain: "I built a small, hand-written knowledge system so an AI agent can work on this codebase without re-reading it every time. It's deliberately simple — the industry-standard version would cost more and explain less at this size."
---

**Decision.** File-based, human-authored knowledge base with tiered retrieval and an explicit task router: one entry document, a table mapping task type to the one or two documents it needs, an ignore map, one-owning-doc rule, stated token budget. No embeddings, no vector store. Source carries no explanatory comments by rule — context lives in the owning document.

**Instead of** enterprise-style RAG. Rejected on sizing, not principle: ~1.6k lines across thirteen documents. A router that *names* the right document beats similarity search at that scale, costs nothing to run, and is auditable — when retrieval goes wrong the reason is legible in a table rather than buried in an embedding space. Retrieval here is a curation problem, not a search problem.

**For** the operator: a common task loads the entry document plus one or two others and runs zero repo-wide searches — a stated, measurable cost per task.

**Still evolving, by design.** This is the correctly-sized form for today's corpus, not a finished position. As it grows and local models become practical to run, routing and retrieval move onto a local LLM — offline, no per-token cost — and at that size embeddings start earning their complexity. The swap is a change of retrieval mechanism, not a rewrite: the documents stay the source of truth, and the router table is exactly the ground truth a retrieval evaluation would need.
