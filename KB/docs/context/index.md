# Corp Tower — context entry

Router for the production concept-addressable KB Tree knowledge base.

## System

Corp Tower is a three-player real-time selfish-cooperation tower puzzle with a
Godot client, authoritative Node.js WebSocket server, and Redis-backed shared
room state. The server decides outcomes; the client renders authoritative state.

## Retrieval contract

Resolve a task to one semantic concept. Read only that concept's leaf section,
then its generated concept-map section and bounded source grants. If more product
knowledge is required, return to this router and choose only an explicitly
declared adjacent concept. Never jump sideways by repository-wide search.

<!-- BEGIN GENERATED CONCEPT ROUTER -->

### automation

| Concept | Owning section | Aliases |
|---|---|---|
| `automation.docs.maps` | [automation.md#map-regeneration](./automation.md#map-regeneration) | concept map generator |
| `automation.docs.retrieval-repair` | [automation.md#retrieval-repair](./automation.md#retrieval-repair) | retrieval maintenance |
| `automation.docs.scope` | [automation.md#docs-scoping](./automation.md#docs-scoping) | source concept ownership, documentation ownership |
| `automation.docs.validation` | [automation.md#kb-validation](./automation.md#kb-validation) | concept KB validator, KB validator |
| `automation.execution.io-discipline` | [automation.md#provider-visible-io-discipline](./automation.md#provider-visible-io-discipline) | provider-visible I/O, Codex I/O discipline |
| `automation.git.publish` | [automation.md#authorized-git-publication](./automation.md#authorized-git-publication) | targeted push, git sync commit push |
| `automation.observability.binding` | [automation.md#observability-binding](./automation.md#observability-binding) | agent observability, task binding |
| `automation.observability.flags` | [automation.md#workflow-inefficiency-flags](./automation.md#workflow-inefficiency-flags) | workflow candidate, inefficiency flag |
| `automation.observability.usage` | [automation.md#observability-usage](./automation.md#observability-usage) | provider tokens, rollout usage |
| `automation.orchestration.execution` | [automation.md#orchestrated-execution](./automation.md#orchestrated-execution) | orchestrated execution, multi-agent implementation |
| `automation.orchestration.ownership` | [automation.md#orchestration-ownership](./automation.md#orchestration-ownership) | worker scope, parallel ownership |
| `automation.retrieval.aliases` | [automation.md#retrieval-aliases](./automation.md#retrieval-aliases) | retrieval-aliases.json |
| `automation.retrieval.bundle` | [automation.md#context-bundles](./automation.md#context-bundles) | context bundle |
| `automation.retrieval.direct` | [automation.md#direct-retrieval-discipline](./automation.md#direct-retrieval-discipline) | agent retrieval, bounded context |
| `automation.retrieval.fallback` | [automation.md#retrieval-fallback](./automation.md#retrieval-fallback) | source fallback, broad fallback |
| `automation.retrieval.protocol` | [automation.md#concept-retrieval-protocol](./automation.md#concept-retrieval-protocol) | context.mjs, context query |
| `automation.retrieval.states` | [automation.md#retrieval-result-states](./automation.md#retrieval-result-states) | needs-anchor, needs-filter, retrieval-defect |
| `automation.task-close.lifecycle` | [automation.md#task-close-lifecycle](./automation.md#task-close-lifecycle) | task close, task-close |
| `automation.task-close.plan-archive` | [automation.md#plan-archival](./automation.md#plan-archival) | plan done, archive plan |
| `automation.task-close.receipt` | [automation.md#public-receipt](./automation.md#public-receipt) | qa receipt, public receipt |
| `automation.task-close.scope` | [automation.md#task-close-scope](./automation.md#task-close-scope) | task manifest, owned paths |
| `automation.task-close.verification` | [automation.md#task-close-verification](./automation.md#task-close-verification) | task close QA, maintenance-blocked |

### backend

| Concept | Owning section | Aliases |
|---|---|---|
| `backend.authority.engine` | [backend.md#game-engine-boundary](./backend.md#game-engine-boundary) | Game Engine ownership |
| `backend.authority.persistence` | [backend.md#persistence-ownership](./backend.md#persistence-ownership) | Redis ownership, room persistence authority |
| `backend.authority.server` | [backend.md#server-authority](./backend.md#server-authority) | server authoritative |
| `backend.bots.preview` | [backend.md#bot-preview](./backend.md#bot-preview) | Bot Manager, bot candidate preview |
| `backend.config.values` | [backend.md#configuration-ownership](./backend.md#configuration-ownership) | Game Config, tuning values |
| `backend.engine.last-chance` | [backend.md#last-chance-authority](./backend.md#last-chance-authority) | last chance |
| `backend.engine.lifecycle` | [backend.md#engine-lifecycle](./backend.md#engine-lifecycle) | game state lifecycle |
| `backend.engine.placement` | [backend.md#placement-authority](./backend.md#placement-authority) | placement validation, release row server |
| `backend.engine.power-events` | [backend.md#power-events](./backend.md#power-events) | Power events, transient events |
| `backend.engine.timers` | [backend.md#engine-timers](./backend.md#engine-timers) | server timers, room deadlines |
| `backend.identity.auth` | [backend.md#identity-verification](./backend.md#identity-verification) | authentication, Supabase auth, Facebook auth |
| `backend.identity.profile` | [backend.md#durable-profiles](./backend.md#durable-profiles) | profile store, account store |
| `backend.impacts.requirement` | [backend.md#impact-authority](./backend.md#impact-authority) | Impacts.js, Impact status |
| `backend.impacts.rollback` | [backend.md#impact-rollback](./backend.md#impact-rollback) | Impact rollback |
| `backend.lobby.active-leave` | [backend.md#intentional-active-leave](./backend.md#intentional-active-leave) | leave game, active leave |
| `backend.lobby.close` | [backend.md#terminal-room-close](./backend.md#terminal-room-close) | room closed, room teardown |
| `backend.lobby.connection` | [backend.md#session-connection-ownership](./backend.md#session-connection-ownership) | connection id ownership, superseded socket |
| `backend.lobby.cross-pod` | [backend.md#cross-pod-ownership](./backend.md#cross-pod-ownership) | multi pod room, lease owner |
| `backend.lobby.debug-config` | [backend.md#debug-configuration](./backend.md#debug-configuration) | runtime debug config, runtime tuning |
| `backend.lobby.private` | [backend.md#private-rooms](./backend.md#private-rooms) | private lobby, private server room |
| `backend.lobby.public` | [backend.md#public-matchmaking](./backend.md#public-matchmaking) | public matchmaking room, matchmaking |
| `backend.redis.hydration` | [backend.md#hydration-continuity](./backend.md#hydration-continuity) | room hydration, persisted room |
| `backend.redis.leases` | [backend.md#redis-leases](./backend.md#redis-leases) | Redis State, room lease |
| `backend.scoring.transaction` | [backend.md#scoring-transaction](./backend.md#scoring-transaction) | Scoring.js, placement scoring |
| `backend.stability.analysis` | [backend.md#support-graph](./backend.md#support-graph) | stability analyzer, support graph |
| `backend.stability.collapse` | [backend.md#collapse-authority](./backend.md#collapse-authority) | tower collapse, collapse components |
| `backend.stability.pose` | [backend.md#structural-pose](./backend.md#structural-pose) | server structural pose |
| `backend.supply.authority` | [backend.md#supply-authority](./backend.md#supply-authority) | Block Supply |

### build

| Concept | Owning section | Aliases |
|---|---|---|
| `build.android.aab-validation` | [build.md#aab-validation](./build.md#aab-validation) | bundle validation, target SDK |
| `build.android.pipeline` | [build.md#android-pipeline](./build.md#android-pipeline) | Android CI, AAB build |
| `build.android.startup-splash` | [build.md#startup-splash](./build.md#startup-splash) | Android splash crop, Android extended splash |
| `build.android.version-code` | [build.md#play-version-code](./build.md#play-version-code) | versionCode, Play track version |
| `build.art.private-bundle` | [build.md#private-art-bundle](./build.md#private-art-bundle) | private art, R2 art bundle |
| `build.auth.native-providers` | [build.md#native-provider-build-inputs](./build.md#native-provider-build-inputs) | native Google sign in, native Facebook |
| `build.endpoint-auth.injection` | [build.md#endpoint-and-auth-injection](./build.md#endpoint-and-auth-injection) | write endpoint config, auth injection |
| `build.godot.asset-import` | [build.md#godot-asset-import](./build.md#godot-asset-import) | Godot import, font import |
| `build.server.image` | [build.md#server-image](./build.md#server-image) | server Dockerfile, server image |

### deploy

| Concept | Owning section | Aliases |
|---|---|---|
| `deploy.backup.auto-deploy` | [deployment-backup.md#auto-deploy-guard](./deployment-backup.md#auto-deploy-guard) | Backup Deploy All, live status guard |
| `deploy.backup.cloudflare-record` | [deployment-backup.md#cloudflare-record-verification](./deployment-backup.md#cloudflare-record-verification) | proxied CNAME, wait_for_cname |
| `deploy.backup.cloudflare-tls` | [deployment-backup.md#cloudflare-tls](./deployment-backup.md#cloudflare-tls) | Universal SSL, tunnel TLS |
| `deploy.backup.cloudflared-service` | [deployment-backup.md#tunnel-service-ownership](./deployment-backup.md#tunnel-service-ownership) | cloudflared systemd |
| `deploy.backup.connector-uniqueness` | [deployment-backup.md#connector-uniqueness](./deployment-backup.md#connector-uniqueness) | stale tunnel connector |
| `deploy.backup.demo-mode` | [deployment-backup.md#demo-differences](./deployment-backup.md#demo-differences) | demo instance, instance 3 |
| `deploy.backup.demo-redis` | [deployment-backup.md#demo-redis](./deployment-backup.md#demo-redis) | backup redis, demo counters |
| `deploy.backup.machine-state` | [deployment-backup.md#machine-local-state](./deployment-backup.md#machine-local-state) | backup state dir, checkout clean |
| `deploy.backup.offline-runner` | [deployment-backup.md#offline-runner-behavior](./deployment-backup.md#offline-runner-behavior) | self hosted runner offline |
| `deploy.backup.runbook` | [deployment-backup.md#operator-runbook](./deployment-backup.md#operator-runbook) | backup runbook, demo cleanup |
| `deploy.backup.topology` | [deployment-backup.md#host-topology](./deployment-backup.md#host-topology) | backup server, physical machine, demo host |
| `deploy.backup.workflow-context` | [deployment-backup.md#reusable-workflow-trigger-context](./deployment-backup.md#reusable-workflow-trigger-context) | workflow_call event name |
| `deploy.backup.workflow-skips` | [deployment-backup.md#skipped-job-dependency](./deployment-backup.md#skipped-job-dependency) | skipped job cascade |
| `deploy.eks.applied-tree` | [deployment-eks.md#applied-tree-guard](./deployment-eks.md#applied-tree-guard) | verify-infra, applied tree hash |
| `deploy.eks.destroy-verification` | [deployment-eks.md#destroy-verification](./deployment-eks.md#destroy-verification) | Tagging API lag, orphan check |
| `deploy.eks.dns` | [deployment-eks.md#dns-update](./deployment-eks.md#dns-update) | CNAME wait, ALB DNS |
| `deploy.eks.lifecycle` | [deployment-eks.md#infrastructure-lifecycle](./deployment-eks.md#infrastructure-lifecycle) | EKS apply, EKS destroy, auto destroy |
| `deploy.eks.manual-setup` | [deployment-eks.md#operator-setup](./deployment-eks.md#operator-setup) | EKS manual setup |
| `deploy.eks.node-security` | [deployment-eks.md#node-security-groups](./deployment-eks.md#node-security-groups) | EKS security group, cross node DNS |
| `deploy.eks.topology` | [deployment-eks.md#topology](./deployment-eks.md#topology) | EKS topology, ALB NodePort |
| `deploy.eks.workflows` | [deployment-eks.md#deployment-workflows](./deployment-eks.md#deployment-workflows) | EKS deploy |
| `deploy.shared.auth-env` | [deployment.md#authentication-environment](./deployment.md#authentication-environment) | Supabase env, identity secret |
| `deploy.shared.environments` | [deployment.md#environment-model](./deployment.md#environment-model) | deployment environments |
| `deploy.shared.secret-rollout` | [deployment.md#secret-rollout](./deployment.md#secret-rollout) | kubernetes secret restart, GITHUB_ENV |
| `deploy.shared.terraform-roots` | [deployment.md#terraform-roots](./deployment.md#terraform-roots) | Terraform roots, shared infra |

### gameplay

| Concept | Owning section | Aliases |
|---|---|---|
| `gameplay.bots.calibration` | [gameplay.md#bot-calibration-limit](./gameplay.md#bot-calibration-limit) | bot collapse rate, balance calibration |
| `gameplay.bots.cooperative` | [gameplay.md#cooperative-bot-behavior](./gameplay.md#cooperative-bot-behavior) | cooperative bots, MVP greedy |
| `gameplay.bots.scoring` | [gameplay.md#bot-scoring-policy](./gameplay.md#bot-scoring-policy) | bot scoring, bot placement policy |
| `gameplay.core.loop` | [gameplay.md#core-loop](./gameplay.md#core-loop) | selfish cooperation, core gameplay loop |
| `gameplay.debug.last-chance` | [gameplay.md#last-chance](./gameplay.md#last-chance) | last chance power |
| `gameplay.debug.tuning` | [gameplay.md#debug-tuning](./gameplay.md#debug-tuning) | debug config, live tuning |
| `gameplay.impact.checkpoint-credit` | [gameplay.md#checkpoint-credit](./gameplay.md#checkpoint-credit) | Impact checkpoint credit |
| `gameplay.impact.eligible` | [gameplay.md#eligible-contribution](./gameplay.md#eligible-contribution) | Impact contribution, eligible score |
| `gameplay.impact.requirement` | [gameplay.md#personal-requirement](./gameplay.md#personal-requirement) | Impact requirement, personal contribution requirement |
| `gameplay.power.inventory` | [gameplay.md#power-inventory](./gameplay.md#power-inventory) | Power items, power inventory |
| `gameplay.power.replenish` | [gameplay.md#replenish](./gameplay.md#replenish) | refresh, free_refresh |
| `gameplay.progression.failure` | [gameplay.md#failure-rules](./gameplay.md#failure-rules) | level failure, timer failure, supply failure |
| `gameplay.progression.rollback` | [gameplay.md#impact-rollback](./gameplay.md#impact-rollback) | checkpoint rollback, retry band |
| `gameplay.progression.timing` | [gameplay.md#round-timing](./gameplay.md#round-timing) | round timer, level clock |
| `gameplay.scoring.critical-save` | [gameplay.md#critical-save](./gameplay.md#critical-save) | critical save, save scoring, worried support rescue |
| `gameplay.scoring.exact-finish` | [gameplay.md#exact-finish](./gameplay.md#exact-finish) | exact finish, exact height reward |
| `gameplay.scoring.height` | [gameplay.md#height](./gameplay.md#height) | height score, new height |
| `gameplay.scoring.recovery` | [gameplay.md#recovery](./gameplay.md#recovery) | recovery score, rebuild score |
| `gameplay.scoring.reinforcement` | [gameplay.md#reinforcement](./gameplay.md#reinforcement) | reinforcement scoring, reinforce, structural repair score |
| `gameplay.scoring.transaction` | [gameplay.md#placement-transaction](./gameplay.md#placement-transaction) | placement score, score transaction |
| `gameplay.session.reconnect` | [gameplay.md#reconnect-meaning](./gameplay.md#reconnect-meaning) | resume gameplay, reconnect seat |
| `gameplay.supply.bricks` | [gameplay.md#brick-dealing](./gameplay.md#brick-dealing) | tetromino supply, brick shapes |
| `gameplay.supply.carry-over` | [gameplay.md#carry-over](./gameplay.md#carry-over) | carry over bricks |
| `gameplay.supply.reserve` | [gameplay.md#shared-supply](./gameplay.md#shared-supply) | draw pile, reserve sizing, not enough height |
| `gameplay.tower.placement` | [gameplay.md#release-row-and-gravity](./gameplay.md#release-row-and-gravity) | release row, gap placement, overhang |
| `gameplay.tower.pose` | [gameplay.md#structural-pose-meaning](./gameplay.md#structural-pose-meaning) | tower pose rules, structural pose |
| `gameplay.tower.site` | [gameplay.md#placeable-site](./gameplay.md#placeable-site) | tower site, placeable range, grid width |
| `gameplay.tower.stability` | [gameplay.md#stability-design](./gameplay.md#stability-design) | tower stability, Balance and Integrity, weak support rules |

### hud

| Concept | Owning section | Aliases |
|---|---|---|
| `hud.constraint.rendered-verification` | [ui-hud.md#rendered-verification](./ui-hud.md#rendered-verification) | collapse visual QA, tower rendered QA |
| `hud.controller.architecture` | [ui-hud.md#controller-architecture](./ui-hud.md#controller-architecture) | GameUi controller architecture, GameUi modules, HUD controller modules |
| `hud.controller.parallel-placement` | [ui-hud.md#parallel-placement](./ui-hud.md#parallel-placement) | tap placement, armed placement |
| `hud.controller.state-application` | [ui-hud.md#state-application](./ui-hud.md#state-application) | Game UI controller, Main.gd |
| `hud.navigation.auto-follow` | [ui-hud.md#automatic-follow](./ui-hud.md#automatic-follow) | auto scroll, tower camera follow |
| `hud.navigation.drop-top` | [ui-hud.md#drop-and-top](./ui-hud.md#drop-and-top) | Drop UI, Top button, weak support navigation |
| `hud.navigation.manual-inspection` | [ui-hud.md#manual-inspection](./ui-hud.md#manual-inspection) | manual pan, scroll down tower |
| `hud.overlays.popovers` | [ui-hud.md#shared-popovers](./ui-hud.md#shared-popovers) | glass popover, chat popover, Power popover, Quest popover |
| `hud.overlays.score-popups` | [ui-hud.md#score-popups](./ui-hud.md#score-popups) | score event popup |
| `hud.overlays.summary` | [ui-hud.md#summary-overlay](./ui-hud.md#summary-overlay) | Level Summary, failure summary |
| `hud.placement.armed` | [ui-hud.md#armed-placement](./ui-hud.md#armed-placement) | armed action, tap confirm |
| `hud.placement.coordinates` | [ui-hud.md#rendered-coordinate-boundary](./ui-hud.md#rendered-coordinate-boundary) | rendered coordinates, canonical grid |
| `hud.placement.ghost` | [ui-hud.md#ghost-and-contact-marker](./ui-hud.md#ghost-and-contact-marker) | placement ghost, contact marker |
| `hud.placement.snapping` | [ui-hud.md#snapping](./ui-hud.md#snapping) | Snap Grid, snap radius, release row preview |
| `hud.players.impact-bars` | [ui-hud.md#impact-bars](./ui-hud.md#impact-bars) | Impact progress, contribution bar |
| `hud.players.latency` | [ui-hud.md#latency-presentation](./ui-hud.md#latency-presentation) | latency indicator |
| `hud.players.presence` | [ui-hud.md#player-presence](./ui-hud.md#player-presence) | disconnected player UI, LEFT player |
| `hud.tower.collapse.presentation` | [ui-hud.md#collapse-presentation](./ui-hud.md#collapse-presentation) | tower collapse UI, collapse framing |
| `hud.tower.collapse.recovery` | [ui-hud.md#collapse-recovery](./ui-hud.md#collapse-recovery) | collapse camera recovery, pan after collapse |
| `hud.tower.fallen` | [ui-hud.md#fallen-bricks](./ui-hud.md#fallen-bricks) | collapse debris, fallen blocks |
| `hud.tower.impact-beat` | [ui-hud.md#impact-beat](./ui-hud.md#impact-beat) | Impact Beat |
| `hud.tower.pose` | [ui-hud.md#structural-pose](./ui-hud.md#structural-pose) | tower pose, lean rendering |
| `hud.tower.weak-support` | [ui-hud.md#weak-support-feedback](./ui-hud.md#weak-support-feedback) | worried brick, red outline, weak support |

### network

| Concept | Owning section | Aliases |
|---|---|---|
| `network.adapters.boundaries` | [networking.md#adapter-boundaries](./networking.md#adapter-boundaries) | wire adapters, network boundaries |
| `network.compatibility.deploy-together` | [networking.md#compatibility-boundary](./networking.md#compatibility-boundary) | wire compatibility, mixed version |
| `network.messages.families` | [networking.md#message-families](./networking.md#message-families) | websocket messages, message types |
| `network.messages.latency` | [networking.md#latency-diagnostics](./networking.md#latency-diagnostics) | latency_ping, latency_pong, RTT |
| `network.placement.contract` | [networking.md#placement-contract](./networking.md#placement-contract) | place_block, release row wire |
| `network.room.active-leave` | [networking.md#active-leave](./networking.md#active-leave) | game_left, leave_game |
| `network.room.close` | [networking.md#room-close](./networking.md#room-close) | room_closed |
| `network.room.cross-pod` | [networking.md#cross-pod-room-routing](./networking.md#cross-pod-room-routing) | cross pod routing |
| `network.room.private` | [networking.md#private-lobby](./networking.md#private-lobby) | private lobby recovery, reserved seat |
| `network.room.public` | [networking.md#public-lobby](./networking.md#public-lobby) | public lobby wire, ready up |
| `network.session.identity` | [networking.md#startup-identity](./networking.md#startup-identity) | connection identity, auth wire |
| `network.session.recovery` | [networking.md#active-stream-recovery](./networking.md#active-stream-recovery) | resync, reconnect recovery, stale stream |
| `network.session.resume-only` | [networking.md#resume-only-startup](./networking.md#resume-only-startup) | resumeOnly, saved room resume |
| `network.session.supersession` | [networking.md#socket-supersession](./networking.md#socket-supersession) | old socket, current connection id |
| `network.state.grid-site` | [networking.md#grid-and-site-state](./networking.md#grid-and-site-state) | grid width payload, placeable range payload |
| `network.state.impact-status` | [networking.md#impact-status-state](./networking.md#impact-status-state) | impactScoreStatus |
| `network.state.revision` | [networking.md#state-revision-and-resync](./networking.md#state-revision-and-resync) | stateRevision, resync_state |
| `network.state.snapshot` | [networking.md#snapshot-contract](./networking.md#snapshot-contract) | game_state, authoritative snapshot |
| `network.state.transient-events` | [networking.md#transient-events](./networking.md#transient-events) | score events, transient event replay |

### site

| Concept | Owning section | Aliases |
|---|---|---|
| `site.content.schema` | [site.md#content-model](./site.md#content-model) | portfolio content schema, portfolio honesty markers |
| `site.deployment.contract` | [site.md#build-and-deployment](./site.md#build-and-deployment) | portfolio build deployment, portfolio Workers deploy |
| `site.diagram.accessibility` | [site.md#diagram-interaction](./site.md#diagram-interaction) | portfolio diagram accessibility, diagram interaction |
| `site.disclosure.navigation` | [site.md#disclosure-and-navigation](./site.md#disclosure-and-navigation) | portfolio disclosure behavior, portfolio navigation behavior |
| `site.editorial.evidence` | [site.md#editorial-evidence](./site.md#editorial-evidence) | portfolio editorial register, portfolio claim evidence |
| `site.visual.language` | [site.md#visual-language](./site.md#visual-language) | portfolio visual language, site token roles |

### testing

| Concept | Owning section | Aliases |
|---|---|---|
| `testing.automation.protocol` | [testing.md#automation-protocol-coverage](./testing.md#automation-protocol-coverage) | automation tests, retrieval benchmark |
| `testing.balance.tools` | [testing.md#balance-tools](./testing.md#balance-tools) | balance simulator, stability probe, impact probe |
| `testing.client.coverage` | [testing.md#godot-coverage](./testing.md#godot-coverage) | GUT, client smoke |
| `testing.client.rendered` | [testing.md#rendered-client-verification](./testing.md#rendered-client-verification) | rendered QA, manual visual QA |
| `testing.client.snapgrid-isolation` | [testing.md#snapgrid-shared-state-isolation](./testing.md#snapgrid-shared-state-isolation) | SnapGrid shared state, placeable range test isolation |
| `testing.contract.tutorial-parity` | [testing.md#tutorial-parity](./testing.md#tutorial-parity) | tutorial parity test |
| `testing.release.gates` | [testing.md#release-gates](./testing.md#release-gates) | CI gates, release QA |
| `testing.selection.local` | [testing.md#local-qa-selection](./testing.md#local-qa-selection) | qa-gate, targeted QA |
| `testing.server.coverage` | [testing.md#server-coverage](./testing.md#server-coverage) | Node tests, server tests |
| `testing.server.reconnect` | [testing.md#reconnect-coverage](./testing.md#reconnect-coverage) | reconnect tests |

### tutorial

| Concept | Owning section | Aliases |
|---|---|---|
| `tutorial.architecture.layer` | [ui-tutorial.md#tutorial-architecture](./ui-tutorial.md#tutorial-architecture) | tutorial layer, coach marks |
| `tutorial.defaults.parity` | [ui-tutorial.md#level-1-defaults-parity](./ui-tutorial.md#level-1-defaults-parity) | TutorialLessons.DEFAULTS, tutorial parity |
| `tutorial.entry.flow` | [ui-tutorial.md#tutorial-entry](./ui-tutorial.md#tutorial-entry) | How to Play, start tutorial |
| `tutorial.lesson.placement` | [ui-tutorial.md#placement-lesson](./ui-tutorial.md#placement-lesson) | tutorial gap placement |
| `tutorial.scene.scripted` | [ui-tutorial.md#scripted-authority-boundary](./ui-tutorial.md#scripted-authority-boundary) | fake server tutorial, TutorialScene |
| `tutorial.step.info` | [ui-tutorial.md#info-step-dispatch](./ui-tutorial.md#info-step-dispatch) | is_satisfied info |
| `tutorial.step.spotlight` | [ui-tutorial.md#spotlight-scope](./ui-tutorial.md#spotlight-scope) | tutorial spotlight, PlayField spotlight |

### ui

| Concept | Owning section | Aliases |
|---|---|---|
| `ui.auth.presentation` | [ui.md#authentication-screen](./ui.md#authentication-screen) | sign in screen, oauth UI |
| `ui.constraint.pointer-input` | [ui.md#pointer-pass-through](./ui.md#pointer-pass-through) | mouse filter, tap blocking |
| `ui.constraint.rendered-verification` | [ui.md#rendered-verification](./ui.md#rendered-verification) | visual verification, device check |
| `ui.constraint.scene-order` | [ui.md#scene-text-format-constraint](./ui.md#scene-text-format-constraint) | scene parent order |
| `ui.control.pressed-state` | [ui.md#pressed-control-treatment](./ui.md#pressed-control-treatment) | pressed state, button pressed treatment, card pressed state |
| `ui.debug.entry` | [ui.md#debug-entry](./ui.md#debug-entry) | debug button, debug panel entry |
| `ui.home.navigation` | [ui.md#home](./ui.md#home) | home screen |
| `ui.navigation.server-routes` | [ui.md#server-driven-navigation](./ui.md#server-driven-navigation) | navigation destination, room routing |
| `ui.play.menu` | [ui.md#play-menu](./ui.md#play-menu) | burger menu, play overlay |
| `ui.play.recovery` | [ui.md#active-match-recovery](./ui.md#active-match-recovery) | resync popup, recovery modal |
| `ui.private-lobby.presentation` | [ui.md#private-lobby-presentation](./ui.md#private-lobby-presentation) | private lobby UI |
| `ui.private.create` | [ui.md#private-server-creation](./ui.md#private-server-creation) | create private server, private server screen |
| `ui.private.join` | [ui.md#join-server](./ui.md#join-server) | join server, server id paste |
| `ui.public-lobby.flow` | [ui.md#public-matchmaking-and-lobby](./ui.md#public-matchmaking-and-lobby) | find match, public lobby |
| `ui.settings.presentation` | [ui.md#settings](./ui.md#settings) | settings screen |
| `ui.shell.core` | [ui.md#client-shell](./ui.md#client-shell) | Screen Manager, Main shell |
| `ui.shell.responsive` | [ui.md#responsive-root](./ui.md#responsive-root) | responsive layout, portrait root |
| `ui.startup.restoration` | [ui.md#startup-restoration](./ui.md#startup-restoration) | saved room startup, resume startup |
| `ui.startup.splash` | [ui.md#startup-splash](./ui.md#startup-splash) | extended splash, startup splash |
| `ui.visual.glass-card` | [ui.md#glass-card-treatment](./ui.md#glass-card-treatment) | glass card, frosted card, translucent card |

<!-- END GENERATED CONCEPT ROUTER -->

## Isolation

`report/`, `repair/`, `plan/`, `task/`, `reference/`, and `.agent-state/` are not KB evidence and cannot be granted by a concept. Separate task routing may authorize exact working material later.

## Source-locator maps

Generated `map/concept/*.md` output is the semantic KB Tree concept→source
bridge. It is derived from concept metadata and is never hand-edited.
