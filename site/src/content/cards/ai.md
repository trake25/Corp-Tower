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
    title: "1 · Define the task"
    keywords:
      - "Prompt engineering"
      - "Context control"
      - "Token efficiency"
    body: "I break larger requests into clear goals, expected results and constraints before asking an agent to implement them. Prompt engineering makes the guardrails, edge cases and security requirements explicit."
  - id: refine
    title: "2 · Refine the context"
    keywords:
      - "Model selection"
      - "Effort routing"
      - "Token cost"
    body: "I give the agent focused instructions instead of sending unnecessary information. Prompt compression reduces noise and token cost; model selection and effort routing stay proportionate to the task."
  - id: route
    title: "3 · Retrieve what matters"
    keywords:
      - "RAG"
      - "Context routing"
      - "Selective loading"
    body: "The coding agent does not need the entire repository. Relevant documents and files are identified and loaded when the task needs them through RAG, context routing and selective loading."
  - id: plan
    title: "4 · Plan the change"
    keywords:
      - "Planning"
      - "Approval"
      - "Review"
    body: "The agent proposes an implementation plan before changing the code. I review the approach and remain responsible for the engineering decision, especially on medium, large or security-sensitive work."
  - id: implement
    title: "5 · Implement"
    keywords:
      - "Retrieval-Augmented Generation"
      - "Context Routing"
      - "Selective Loading"
    body: "The agent handles more of the implementation work while following the approved context and plan. Context routing keeps it grounded instead of asking it to infer repository-wide facts."
  - id: review
    title: "6 · Test and review"
    keywords:
      - "Human-in-the-Loop"
      - "Plan Approval"
      - "Hallucination Risk"
    body: "Tests and manual verification determine whether the result is actually acceptable. The agent can fix problems, but acceptance remains mine; review checks the result against the approved plan and hallucination risk."
---

#### Local LLMs, once the hardware exists

The current workflow uses cloud models. If capable local hardware becomes available, the retrieval router is the first part to move; the source documents and approval process stay the same.
