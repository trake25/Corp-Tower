---
role: "Frontend"
order: 5
headline: "Rules out of the renderer, so the part that has to be correct is testable in seconds."
plain: "The game's logic is kept completely separate from its graphics. Placement, anchors and the collapse simulation can be checked without ever opening the game."
tools:
  - "Godot"
  - "GDScript"
  - "GUT (Godot tests)"
details:
  - id: objectives
    title: "1 · The screen never decides"
    keywords:
      - "Server Authority"
      - "Client Contract"
      - "Desync Prevention"
    body: "The client's whole job is stated as one rule: connect, render whatever the server says the room/level/score/tower state is, and send the player's actions — and never calculate a final gameplay outcome itself. If the phone's own math ever disagreed with the server's, the server wins, silently, on the next update. That constraint is set before a single screen is drawn, not discovered later by fixing a desync."
    evidence:
      label: "The one-line rule the whole client answers to"
      href: "https://github.com/trake25/Corp-Tower/blob/main/docs/context/ui.md#godot-client-app-shell"
  - id: architecture
    title: "2 · Small pieces, one conductor"
    keywords:
      - "Component Decomposition"
      - "Single Responsibility"
      - "State Ownership"
    body: "What used to be one file well past two thousand lines is now a slim conductor delegating to focused, single-purpose pieces — one for the inventory, one for chat, one for the score popups, and so on. Each piece declares exactly which on-screen elements it needs and owns its own state; the conductor wires them together but doesn't do their job for them. Nothing gets added back into that one file just because it's convenient."
  - id: implementation
    title: "3 · The tower draws what happened"
    keywords:
      - "Deterministic Rendering"
      - "Seeded Simulation"
      - "Physics Hand-off"
    body: "The piece that actually draws the tower doesn't decide anything — it takes the server's placement, plays the drop animation, and if the tower fails, hands off to a separate physics piece that plays the pieces falling apart. Even the collapse looks the same on every player's screen, because it's seeded from the exact same block data everyone already agrees on, not randomised locally per device."
  - id: optimization
    title: "4 · The camera moves, not the bricks"
    keywords:
      - "Render Performance"
      - "Viewport Strategy"
      - "Draw Cost"
    body: "Bricks never shrink to fit a taller tower — they stay a fixed size on screen no matter how high the tower gets. Instead, the camera view scrolls to keep the top of the tower visible. Resizing every brick every frame as a tower grows is real, repeated work for no visual benefit; scrolling the view is cheaper and reads better, since the bricks a player already placed don't visibly shift size under them."
  - id: validation
    title: "5 · Checked without opening the game"
    keywords:
      - "Unit Testing"
      - "Scene-Free Logic"
      - "Edge Cases"
    body: "The riskiest math in the client — exactly where a dragged piece is allowed to land — doesn't need the game running to check. It's pulled out into a plain, scene-free class, so nineteen tests can pin down the placement rules, corner cases and all, and run in seconds rather than requiring someone to actually play a match."
  - id: readiness
    title: "6 · What the tests can't see, admitted"
    keywords:
      - "Coverage Limits"
      - "Visual Verification"
      - "Stated Boundaries"
    body: "Passing every one of those tests still isn't the same as the game looking right. A bug that wiped the drag preview on the very first move passed all of them, because nothing was actually rendering the screen to check — it was only caught by rendering the play field to an image and looking at it. That's a stated boundary now, not a blind spot: the tests verify the math, and looking at the actual screen is still a separate, required step."
---
