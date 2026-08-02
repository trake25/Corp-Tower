---
role: "AI"
order: 6
headline: "A router beats a vector store at 1.6k lines. Retrieval here is a curation problem, not a search problem."
plain: "I run an AI coding agent the way I'd run any contractor with system access: the task is classified before it starts — what kind of work it is, and how much model and effort it actually needs — then handed only the one or two documents it needs to do it, planned into phases, and kept inside a stated token budget. Some material never crosses into the agent's context at all; that boundary is a design decision, not an afterthought. The steps below are that pipeline."
tools:
  - "Claude Code"
  - "MCP tool servers"
  - "Markdown"
  - "Git"
details:
  - id: classify
    title: "1 · Classify the task, route the model"
    body: "Before anything else, the task decides its own path: what kind of problem it is, and how much model and effort actually proving the answer is worth. A quick lookup gets a fast, cheap pass; a decision with real consequences gets a slower, more careful one. That triage happens before a single document loads."
    evidence:
      label: "The table that routes a task to its context"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/index.md#task-router"
  - id: context
    title: "2 · Contextualize — RAC, not RAG"
    body: "A hand-written router table names the one or two documents a task actually needs, tiered so a common task loads the entry document plus one or two more and runs zero repo-wide searches. That's retrieval as curation rather than retrieval as search — no embeddings, no vector store, no similarity match quietly returning the wrong file."
    evidence:
      label: "Load least, escalate only if needed"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/index.md#retrieval-load-least-escalate-only-if-needed"
  - id: plan
    title: "3 · Plan: goals, phases, delegation"
    body: "Multi-step work gets broken into a short, ordered list of phases before any file changes — scope the diff cheaply, decide whether it's even worth an edit, route it to the one document that owns it, edit, validate, report. An independent, read-only piece of work — a wide search, an isolated investigation — goes to a separate sub-agent instead of running in the main session, so exploring doesn't fill up the context that's doing the actual work."
    evidence:
      label: "The phase list a doc update follows"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/coding-conventions.md#update-procedure-update-docs-diff-driven--never-a-full-rebuild"
  - id: scope
    title: "4 · Scope the prompt to a budget"
    body: "A typical change is expected to touch two to fifteen lines across every document combined; going past thirty in one document is treated as a sign the session is being transcribed rather than the system being documented. That budget forces the instruction itself to stay small — cut to the exact thing that changed, not a summary of the whole session. The same discipline is what keeps prompts to an agent scoped rather than open-ended."
    evidence:
      label: "The line budget a doc edit is held to"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/coding-conventions.md#the-one-rule-that-governs-every-doc-edit"
  - id: security
    title: "5 · What crosses the boundary, and what doesn't"
    body: "Some material never leaves the session that's allowed to touch it. The art pipeline's CI credential is Object-Read-only and cannot publish or delete — only local dev holds the Object-Read-and-Write token, kept out of the repo, so publishing is manual by design. The same split governs what a sub-agent, an API call or an MCP tool gets handed for any task: read access to do the job, not standing write access to whatever it touches."
    evidence:
      label: "The credential split behind the art pipeline"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md#private-asset-pipeline-credential-split"
  - id: close
    title: "6 · Ship, validate, compact — then the loop closes"
    body: "Once the goal is confirmed reached, not before, the docs are updated as a replacement of prose rather than an addition to it, then checked by a script that fails the run on a broken link or a document over its line budget. A separate, occasional pass compacts the whole knowledge base so entropy doesn't quietly collect in documents a routine change never opens. That compacted state is what the next task's step one reads."
    evidence:
      label: "The checks a doc edit has to pass"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/coding-conventions.md#validation-and-budgets"
---
