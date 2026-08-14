---
role: "QA"
order: 3
headline: "Whoever builds it is the worst person to judge it."
plain: "I separate building from acceptance, so the agent never grades its own work."
tools:
  - "GitHub Actions"
  - "Node.js test runner"
  - "GUT (Godot tests)"
  - "Claude Code"
  - "Markdowns"
details:
  - id: spec
    title: "1 · Specification and expected results, first"
    keywords:
      - "Acceptance Criteria"
      - "Test Planning"
      - "Shift-Left Testing"
    body: "Before planning or building, I write what the feature must do and the exact expected result. Everything after that is measured against the list."
    evidence:
      label: "How that specification gets built in the first place"
      href: "https://enportfolio.galaxxigames.com/#card-ai"
  - id: build
    title: "2 · The agent plans and builds"
    keywords:
      - "Separation of Duties"
      - "Test Independence"
      - "Implementation Hand-off"
    body: "The coding agent plans, implements and fixes from the specification. It has no say in whether the result passes — that's judged against step one's expected results."
  - id: tests
    title: "3 · Automated tests run before I look"
    keywords:
      - "Test Automation"
      - "Continuous Integration"
      - "Regression Suites"
    body: "The server suite, Godot suite and CI build run first. They handle repeatable checks consistently; any failure returns the work before manual review."
  - id: manual
    title: "4 · Manual testing against the expected results"
    keywords:
      - "Exploratory Testing"
      - "Manual Verification"
      - "Coverage Gaps"
    body: "Passing tests cover only what was anticipated. I run the real result against step one's expectations, not whether it merely looks finished or the agent sounds confident."
  - id: feedback
    title: "5 · I write the fix instruction"
    keywords:
      - "Defect Reporting"
      - "Actual vs Expected"
      - "Context Control"
    body: "A mismatch returns as a written instruction: what is wrong, where, and what was expected. I keep the context small so the fix remains scoped to the problem rather than reopening the feature."
  - id: docs
    title: "6 · Documentation updated, then compacted"
    keywords:
      - "Documentation Maintenance"
      - "Traceability"
      - "Context Budget"
    body: "Documentation records what shipped, then is compacted to stay within the context budget. Notes that grow without limit stop being useful to both reviewer and agent."
---
