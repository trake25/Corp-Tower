---
role: "QA"
order: 3
headline: "Whoever builds it is the worst person to judge it"
plain: "I work with an AI coding agent the way a tester works with a developer. I write down what \"finished\" means before it starts, it builds, I check it and send it back with specifics, and we go around again until nothing is left over. The write-up comes last."
metric: "0"
metricLabel: "work approved by whoever built it"
tools:
  - "GitHub Actions"
  - "Node.js test runner"
  - "GUT (Godot tests)"
  - "Claude Code"
  - "Written specs"
details:
  - id: requirement
    title: "1 · Write down what finished means"
    body: "Before anything gets built, I write down what it has to do, what it must not break, and how I will check. It is a short note, not a ceremony. The point is that it exists beforehand — so \"finished\" is something agreed in advance, not something decided at the end by whoever got tired first."
  - id: implement
    title: "2 · The agent builds it"
    body: "The coding agent does the building. It gets the note from step one and the parts of the project it needs, and it stays in that one job. It never gets to decide whether its own work is good enough — that is a different job, and handing both to the same party is how weak work gets through."
  - id: gates
    title: "3 · The machine checks first"
    body: "Before I look at anything, automated checks run: does it build, do the tests pass, did anything change that was not meant to. These are the questions a machine can answer, so a machine answers them. If they fail, the work bounces straight back without costing me any time at all."
  - id: verify
    title: "4 · Then I check it"
    body: "I compare the work against what I wrote in step one — not against whether it looks finished, and not against how confident the agent sounds about it. If it does not match, it goes back with specifics: what is wrong, where, and what I expected instead. That loop runs as many times as it needs to."
  - id: docs
    title: "5 · Write it up last"
    body: "The project's notes get updated only once the goal is actually reached. Notes written while the work is still happening describe what someone intended to do. Notes written afterwards describe what actually shipped. Six months later, only one of those is any use."
links:
  - label: "testing.md — gates & known gaps"
    href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/testing.md"
  - label: "Multi-pod regression test"
    href: "https://github.com/trake25/Corp-Tower/blob/main/src/Server/tests/Matchmaking_Queue.test.js"
  - label: "decisions.md — rejected options"
    href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/decisions.md"
---

#### Why not just trust it?

An AI coding agent will tell you it is finished with complete confidence, every single time. That is not dishonesty — it genuinely has no way to know what it does not know. Which leaves two easy options, and both are bad. Believe it, and nothing is ever checked against what you actually asked for. Or use it only for small suggestions, and you end up writing everything yourself anyway. Treating it as a developer who reports into a checking process gets the speed without giving up the checking.

#### The step that does the real work

Step one. Writing down what finished means, before anything starts, is what makes the other four possible — there is something to measure against. Skip it and "finished" gets decided at the end by whoever wants to stop. That is true whether the thing building it is a person or a model.

#### Things I made myself write down

Bad measurements get recorded so nobody repeats them — one setting looked like it changed nothing across wildly different values, because the bots being tested were quietly avoiding the situation it affected. Gaps in what is covered go into a written known-issues list instead of being quietly left out. And a test written to catch a specific bug is only accepted after being run against the broken version first and watched to fail, because a test that has never failed has not proved anything yet.
