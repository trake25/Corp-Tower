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
    title: "1 · Give the agent the right instructions"
    keywords:
      - "Prompt engineering"
      - "Context control"
      - "Token efficiency"
    body: "I start with research and a scoped task, not code. Large requests are split into phases, with guardrails, edge cases and security decided before planning; that becomes the first prompt."
  - id: refine
    title: "2 · Use the right model for the job"
    keywords:
      - "Model selection"
      - "Effort routing"
      - "Token cost"
    body: "I compress the prompt to the constraints and context the task needs, then match model and effort to its complexity. That keeps quality, token cost and turnaround proportionate instead of defaulting to the most expensive option."
  - id: route
    title: "3 · Give the agent only what it needs"
    keywords:
      - "RAG"
      - "Context routing"
      - "Selective loading"
    body: "Retrieval supplies the task-specific documents instead of loading the whole repository. The router selectively loads context and skills on demand, keeping the agent grounded and the context budget useful."
  - id: plan
    title: "4 · Keep the human in control"
    keywords:
      - "Planning"
      - "Approval"
      - "Review"
    body: "Straightforward work can skip formal planning. For medium or large work, especially security-sensitive changes, I review the agent's plan before implementation and give direction instead of allowing guesses."
  - id: rag
    title: "5 · Retrieve context selectively"
    keywords:
      - "Retrieval-Augmented Generation"
      - "Context Routing"
      - "Selective Loading"
    body: "RAG means retrieving the facts a model needs just before it responds. The indexed router names the relevant documents and skills, then loads only those rather than asking the agent to infer repository-wide context."
  - id: review
    title: "6 · Review the result before acceptance"
    keywords:
      - "Human-in-the-Loop"
      - "Plan Approval"
      - "Hallucination Risk"
    body: "The approved plan is the implementation specification. I review the result against it, including context use and hallucination risk; only that review accepts the work."
---

#### Local LLMs, once the hardware exists

The current workflow uses cloud models. If capable local hardware becomes available, the retrieval router is the first part to move; the source documents and approval process stay the same.
