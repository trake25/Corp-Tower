# UI — Tutorial

Scope: the client-side lesson/coach-mark layer and only the cross-domain contracts required to keep tutorial demonstrations aligned with live gameplay.

<!-- kb
id: tutorial.architecture.layer
alias: tutorial layer
alias: coach marks
source: src/Client/App/corp-tower/Cor/Scripts/GameUi/Tutorial/TutorialController.gd#start_lesson
-->
## Tutorial architecture

The tutorial is a client-side lesson/coach-mark layer rendered over the real Game UI. Its modules separate lesson catalog/defaults, gate predicates, scripted scene state, persisted progress, step lifecycle/spotlight, and the tutorial menu.

<!-- kb
id: tutorial.entry.flow
alias: How to Play
alias: start tutorial
source: src/Client/App/corp-tower/Cor/Scripts/GameUi/Tutorial/TutorialController.gd#start_lesson
adjacent: ui.navigation.server-routes
-->
## Tutorial entry

Tutorial entry points funnel through Screen Manager. Entering from a live match disconnects first, and tutorial-active routing guards against a racing room-close event tearing down the tutorial run.

<!-- kb
id: tutorial.defaults.parity
alias: TutorialLessons.DEFAULTS
alias: tutorial parity
source: src/Client/App/corp-tower/Cor/Scripts/GameUi/Tutorial/TutorialLessons.gd#DEFAULTS
source: scripts/lib/tutorial-defaults-parity.mjs#tutorialDefaultsParity
adjacent: testing.contract.tutorial-parity
-->
## Level-1 defaults parity

Tutorial Level-1 authored defaults are canonical tutorial copy/state, while a narrow cross-domain parity check maps only live server mirrors for derived target, site, inventory, and first-Impact requirements. Authored demonstration values remain tutorial-owned. A server contract change may require lesson text or seeded state beyond the defaults object to move with it.

<!-- kb
id: tutorial.scene.scripted
alias: fake server tutorial
alias: TutorialScene
source: src/Client/App/corp-tower/Cor/Scripts/GameUi/Tutorial/TutorialScene.gd#apply_script
adjacent: hud.controller.state-application
-->
## Scripted authority boundary

Tutorial Scene expands authored lesson seed into the same rendering calls used by live state but does not evaluate legality, stability, or scoring. Structural demonstrations may provide authored presentation pose and canonical Impact status fields without becoming gameplay authority.

<!-- kb
id: tutorial.lesson.placement
alias: tutorial gap placement
source: src/Client/App/corp-tower/Cor/Scripts/GameUi/Tutorial/TutorialLessons.gd#lesson_by_id
adjacent: gameplay.tower.placement
-->
## Placement lesson

The placement lesson teaches release-row behavior: a legal aimed row chooses where a brick begins falling, then gravity resolves first contact. Reachable gaps can therefore be repaired and tutorial wording must not imply that every internal void is permanently unreachable.

<!-- kb
id: tutorial.step.info
alias: is_satisfied info
source: src/Client/App/corp-tower/Cor/Scripts/GameUi/Tutorial/TutorialGates.gd#is_satisfied
source: src/Client/App/corp-tower/Cor/Scripts/GameUi/Tutorial/TutorialController.gd#advance
-->
## Info-step dispatch

Info-step satisfaction is intentionally trivial; the controller must prevent incidental gameplay input from dispatching through an informational step. Treating the predicate as the gate allows unrelated actions to skip instruction.

<!-- kb
id: tutorial.step.spotlight
alias: tutorial spotlight
alias: PlayField spotlight
source: src/Client/App/corp-tower/Cor/Scripts/GameUi/Tutorial/TutorialController.gd#bind_nodes
adjacent: hud.controller.parallel-placement
-->
## Spotlight scope

A lesson needing both inventory controls and the tower must spotlight the encompassing PlayField rather than a narrower child. Narrow spotlights can dim or block the exact sibling input the step requires.
