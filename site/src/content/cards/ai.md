---
role: "AI"
order: 6
headline: "I use AI agents to do more implementation work without giving them control of engineering decisions."
plain: "I decide what needs to be built, give the agent only the information it needs, review its plan, and verify the result."
tools:
  - "Claude Code"
  - "Codex"
  - "Cursor"
  - "ChatGPT"
  - "MCP tool servers"
  - "Git"
details:
  - id: research
    title: "1 · Initial prompting"
    keywords:
      - "Task Decomposition"
      - "Guardrail Definition"
      - "Sub-Agent Delegation"
    body: "The task starts as research, not code — usually worked through with a free-tier sub-agent (ChatGPT, Claude), not the coding agent. An oversized ask gets broken into a goal with smaller phases here, and guardrails, edge cases and security get decided before anything is planned, not after. It ends with a first draft of the prompt."
  - id: refine
    title: "2 · Prompt refining"
    keywords:
      - "Prompt Engineering"
      - "Prompt Compression"
      - "Token Efficiency"
    body: "Once the task is understood, that draft gets cut — through an AI skill, not by hand — to the words, phrases, constraints and context the goal actually needs. Shorter costs fewer tokens, reads clearer, and means fewer clarifying questions once planning starts."
  - id: route
    title: "3 · Model and effort, matched to the task"
    keywords:
      - "Model Selection"
      - "Effort Routing"
      - "Token Cost Control"
    body: "I match the model and effort level to the task instead of using the most expensive option by default. That keeps quality, token use and turnaround proportionate to the work."
  - id: plan
    title: "4 · Planning phase"
    keywords:
      - "Implementation Planning"
      - "Effort Scaling"
      - "Guardrail Review"
    body: "Skipped for anything straightforward — planning a trivial change is its own waste. For medium or large work, especially anything touching a security guardrail, this runs on a higher model at high-to-ultra effort. The refined prompt and the context docs go to the coding agent, and the plan is built from both — it can still come back and ask the orchestrator for direction rather than guess."
  - id: rag
    title: "5 · Simplified RAG"
    keywords:
      - "Retrieval-Augmented Generation"
      - "Context Routing"
      - "Selective Loading"
    body: "RAG is Retrieval-Augmented Generation: pulling in exactly the facts a model needs right before it answers, instead of expecting it to already know them. Inside planning, the coding agent doesn't read the repository — it retrieves. An indexed router names the documents the task needs and loads only those, and loads any AI skill the task calls for, on demand."
  - id: review
    title: "6 · Orchestrator review and approval"
    keywords:
      - "Human-in-the-Loop"
      - "Plan Approval"
      - "Hallucination Risk"
    body: "The plan is now the specification — what's about to change, in exact terms. I read it, refine it, or approve it; only approval starts implementation. This is also the checkpoint for context window, hallucination risk and token usage, the things that quietly cost the most — which is why steps 1 and 2 exist."
---

#### Local LLMs, once the hardware exists

The current workflow uses cloud models. If capable local hardware becomes available, the retrieval router is the first part to move; the source documents and approval process stay the same.
