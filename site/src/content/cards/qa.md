---
role: "QA"
order: 3
headline: "Whoever builds it is the worst person to judge it"
plain: "Before any planning or building starts, I write down the feature specification and the results I expect once it's implemented. Pre-emptive edge cases and security are always then considered before the planning. The coding agent then plans and builds it. When the automated tests pass, I test the output by hand and compare it against those expected results. Anything that doesn't match goes back as a specific, narrowly scoped fix, with the session's context kept deliberately small so the agent doesn't start inventing things. That loop repeats until every expected result is met. Documentation is updated and compacted to a context budget at the end of each task."
tools:
  - "GitHub Actions"
  - "Node.js test runner"
  - "GUT (Godot tests)"
  - "Claude Code"
  - "Written specs - Markdowns"
details:
  - id: spec
    title: "1 · Specification and expected results, first"
    body: "Before any planning or building starts, I write down what the feature has to do and the exact results I expect to see once it exists. Everything after this point gets measured against that list."
  - id: build
    title: "2 · The agent plans and builds"
    body: "The coding agent takes the specification and does the planning with my intervention as needed and the implementation. That is the whole of its job. It does not get to decide whether the result is acceptable — that judgement belongs to whoever wrote the expected results, and keeping those two roles apart is the entire point of the loop."
  - id: tests
    title: "3 · Automated tests run before I look"
    body: "Scripted tests run first: the server suite (Server related source code), the Godot suite (Client related source code), and the build itself (CI/CD Pipeline). They answer the questions a machine answers faster and more consistently than I can. If any of them fail, the work goes straight back without costing me a minute of attention."
  - id: manual
    title: "4 · I test it by hand"
    body: "Passing tests only prove the things somebody already thought to test. So I run the real thing and compare what it actually does against the expected results from step one — not against whether it looks finished, and not against how confident the agent sounds about it."
  - id: feedback
    title: "5 · Fixes go back specific, and small"
    body: "Anything that doesn't match goes back to the agent as one narrowly scoped fix: what is wrong, where, and what I expected instead. I keep the session's context deliberately small while doing it. A long, cluttered session is exactly where an agent starts confidently inventing things that were never there — so the fix stays pinned to the specific problem instead of reopening the whole feature."
  - id: docs
    title: "6 · Documentation updated, then compacted"
    body: "At the end of each task the written documentation is updated to describe what actually shipped rather than what was intended. It is then compacted to stay inside a context budget. Notes that grow without limit stop being useful to both of us, because neither I nor the agent can hold all of it at once."
links:
  - label: "testing.md — gates & known gaps"
    href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/testing.md"
  - label: "Multi-pod regression test"
    href: "https://github.com/trake25/Corp-Tower/blob/main/src/Server/tests/Matchmaking_Queue.test.js"
  - label: "decisions.md — rejected options"
    href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md"
---
