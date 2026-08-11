---
role: "QA"
order: 3
headline: "Whoever builds it is the worst person to judge it"
plain: "I separate building from acceptance: the agent can implement the change, but the expected result is decided first and the finished work has to prove it meets that standard."
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
    body: "Before any planning or building starts, I write down what the feature has to do and the exact results I expect to see once it exists. Everything after this point gets measured against that list."
    evidence:
      label: "How that specification gets built in the first place"
      href: "https://enportfolio.galaxxigames.com/#card-ai"
  - id: build
    title: "2 · The agent plans and builds"
    keywords:
      - "Separation of Duties"
      - "Test Independence"
      - "Implementation Hand-off"
    body: "The coding agent takes the specification and does the planning — with my input where it is needed — the implementation, and the fixes that come back to it from step 5. That is the whole of its job. It does not get to decide whether the result is acceptable — that judgement belongs to whoever wrote the expected results, and keeping those two roles apart is the entire point of the loop."
  - id: tests
    title: "3 · Automated tests run before I look"
    keywords:
      - "Test Automation"
      - "Continuous Integration"
      - "Regression Suites"
    body: "Scripted tests run first: the server suite (server-side code), the Godot suite (client-side code), and the build itself (the CI/CD pipeline). They answer the questions a machine answers faster and more consistently than I can. If any of them fail, the work goes straight back without costing me a minute of attention."
  - id: manual
    title: "4 · Manual testing against the expected results"
    keywords:
      - "Exploratory Testing"
      - "Manual Verification"
      - "Coverage Gaps"
    body: "Passing tests only prove the things somebody already thought to test. So I run the real thing and compare what it actually does against the expected results from step one — not against whether it looks finished, and not against how confident the agent sounds about it."
  - id: feedback
    title: "5 · I write the fix instruction"
    keywords:
      - "Defect Reporting"
      - "Actual vs Expected"
      - "Context Control"
    body: "Anything that doesn't match goes back to the agent as a written instruction: what is wrong, where, and what I expected instead — scoped to that list and nothing else. I keep the session's context deliberately small while doing it. A long, cluttered session is exactly where an agent starts confidently inventing things that were never there — so the fix stays pinned to the specific problem instead of reopening the whole feature."
  - id: docs
    title: "6 · Documentation updated, then compacted"
    keywords:
      - "Documentation Maintenance"
      - "Traceability"
      - "Context Budget"
    body: "At the end of each task the written documentation is updated to describe what actually shipped rather than what was intended. It is then compacted to stay inside a context budget. Notes that grow without limit stop being useful to both of us, because neither I nor the agent can hold all of it at once."
---
