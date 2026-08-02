---
role: "QA"
order: 3
headline: "Whoever builds it is the worst person to judge it"
plain: "I work with an AI coding agent the way a QA engineer works with a developer. The specification and the expected results are written first — edge cases and security considered up front, before any planning — and nothing counts as finished until the real output matches them. The steps below are that loop."
tools:
  - "GitHub Actions"
  - "Node.js test runner"
  - "GUT (Godot tests)"
  - "Claude Code"
  - "Markdowns"
details:
  - id: spec
    title: "1 · Specification and expected results, first"
    body: "Before any planning or building starts, I write down what the feature has to do and the exact results I expect to see once it exists. Everything after this point gets measured against that list."
  - id: build
    title: "2 · The agent plans and builds"
    body: "The coding agent takes the specification and does the planning — with my input where it is needed — the implementation, and the fixes that come back to it from step 5. That is the whole of its job. It does not get to decide whether the result is acceptable — that judgement belongs to whoever wrote the expected results, and keeping those two roles apart is the entire point of the loop."
    evidence:
      label: "The rules the agent works under"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/index.md#working-rules-always-apply"
  - id: tests
    title: "3 · Automated tests run before I look"
    body: "Scripted tests run first: the server suite (server-side code), the Godot suite (client-side code), and the build itself (the CI/CD pipeline). They answer the questions a machine answers faster and more consistently than I can. If any of them fail, the work goes straight back without costing me a minute of attention."
    evidence:
      label: "What CI blocks a release on"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/testing.md#ci-test-gates"
  - id: manual
    title: "4 · Manual testing against the expected results"
    body: "Passing tests only prove the things somebody already thought to test. So I run the real thing and compare what it actually does against the expected results from step one — not against whether it looks finished, and not against how confident the agent sounds about it."
    evidence:
      label: "The bug my own tests missed"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/testing.md#known-coverage-gaps"
  - id: feedback
    title: "5 · I write the fix instruction"
    body: "Anything that doesn't match goes back to the agent as a written instruction: what is wrong, where, and what I expected instead — scoped to that list and nothing else. I keep the session's context deliberately small while doing it. A long, cluttered session is exactly where an agent starts confidently inventing things that were never there — so the fix stays pinned to the specific problem instead of reopening the whole feature."
    evidence:
      label: "A fix proven against the broken version"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/testing.md#server-matchmaking-queue-tests"
  - id: docs
    title: "6 · Documentation updated, then compacted"
    body: "At the end of each task the written documentation is updated to describe what actually shipped rather than what was intended. It is then compacted to stay inside a context budget. Notes that grow without limit stop being useful to both of us, because neither I nor the agent can hold all of it at once."
    evidence:
      label: "The context budget, written down"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/index.md#token-discipline"
---
