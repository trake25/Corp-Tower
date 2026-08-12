---
role: "AI"
order: 6
headline: "Let AI do the work. Keep the decisions."
plain: "I use AI agents for implementation while I control the requirements, context, architecture and acceptance."
tools:
  - "Claude Code"
  - "Codex"
  - "Cursor"
  - "ChatGPT"
  - "MCP tool servers"
  - "Git"
details:
  - id: research
    title: "1 · Define the task"
    keywords:
      - "Prompt engineering"
      - "Context control"
      - "Token efficiency"
    body: "I start with research and a scoped task, not code. Larger requests are split into smaller phases, with constraints and edge cases defined before the agent starts planning."
  - id: refine
    title: "2 · Refine the context"
    keywords:
      - "Model selection"
      - "Effort routing"
      - "Prompt compression"
    body: "I give the agent focused instructions instead of unnecessary information. This reduces noise and keeps the task aligned with the intended result."
  - id: route
    title: "3 · Retrieve what matters"
    keywords:
      - "RAG"
      - "Context routing"
      - "Selective loading"
    body: "The coding agent does not need the entire repository. Relevant documents and files are identified and loaded when the task needs them."
  - id: plan
    title: "4 · Plan the change"
    keywords:
      - "Planning"
      - "Human approval"
      - "Review"
    body: "The agent proposes an implementation plan before changing the code. I review the approach and remain responsible for the engineering decision."
  - id: implement
    title: "5 · Implement"
    keywords:
      - "Agent execution"
      - "Implementation"
      - "Code changes"
    body: "The agent handles the implementation work using the approved context and plan."
  - id: handoff
    title: "6 · Hand off to QA"
    keywords:
      - "Human-in-the-Loop"
      - "Plan Approval"
      - "Context Maintenance"
    body: "Once implementation is complete, it moves into the separate QA process for automated testing, manual verification and acceptance."
---

#### Local LLMs, once the hardware exists

The current workflow uses cloud models. If capable local hardware becomes available, the retrieval router is the first part to move; the source documents and approval process stay the same.
