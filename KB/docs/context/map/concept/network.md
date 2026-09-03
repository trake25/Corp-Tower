# Concept Map — network

DRAFT GENERATED OUTPUT. The repository generator should validate every source target,
resolve stable anchors to current line numbers, and emit bounded source-read ranges.

## network.adapters.boundaries

Owner: `networking.md` → **Adapter boundaries**

| Source seed | Status |
|---|---|
| `src/Server/app/Server.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |
| `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.authority.server`

## network.compatibility.deploy-together

Owner: `networking.md` → **Compatibility boundary**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/Redis_State.js#@file` | coarse `@file` seed — refine before activation |

## network.messages.families

Owner: `networking.md` → **Message families**

| Source seed | Status |
|---|---|
| `src/Server/app/Server.js#@file` | coarse `@file` seed — refine before activation |

## network.messages.latency

Owner: `networking.md` → **Latency diagnostics**

| Source seed | Status |
|---|---|
| `src/Server/app/Server.js#@file` | coarse `@file` seed — refine before activation |
| `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#@file` | coarse `@file` seed — refine before activation |

## network.placement.contract

Owner: `networking.md` → **Placement contract**

| Source seed | Status |
|---|---|
| `src/Server/app/Server.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/engine/Placement.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.tower.placement`, `hud.placement.snapping`

## network.room.active-leave

Owner: `networking.md` → **Active leave**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |
| `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.lobby.active-leave`, `hud.players.presence`

## network.room.close

Owner: `networking.md` → **Room close**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.lobby.close`, `ui.navigation.server-routes`

## network.room.cross-pod

Owner: `networking.md` → **Cross-pod room routing**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/Redis_State.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.lobby.cross-pod`

## network.room.private

Owner: `networking.md` → **Private lobby**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.lobby.private`, `ui.private-lobby.presentation`

## network.room.public

Owner: `networking.md` → **Public lobby**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.lobby.public`

## network.session.identity

Owner: `networking.md` → **Startup identity**

| Source seed | Status |
|---|---|
| `src/Server/app/Server.js#@file` | coarse `@file` seed — refine before activation |
| `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.identity.auth`

## network.session.recovery

Owner: `networking.md` → **Active stream recovery**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `ui.play.recovery`, `backend.lobby.connection`

## network.session.resume-only

Owner: `networking.md` → **Resume-only startup**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |
| `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `ui.startup.restoration`, `backend.lobby.connection`

## network.session.supersession

Owner: `networking.md` → **Socket supersession**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/Redis_State.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.lobby.connection`

## network.state.grid-site

Owner: `networking.md` → **Grid and site state**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#buildGameStateSnapshot` | stable-anchor seed |

Adjacent concepts: `gameplay.tower.site`, `hud.placement.snapping`

## network.state.impact-status

Owner: `networking.md` → **Impact status state**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#buildGameStateSnapshot` | stable-anchor seed |

Adjacent concepts: `gameplay.impact.eligible`, `hud.players.impact-bars`

## network.state.revision

Owner: `networking.md` → **State revision and resync**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#buildGameStateSnapshot` | stable-anchor seed |
| `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.session.recovery`

## network.state.snapshot

Owner: `networking.md` → **Snapshot contract**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#buildGameStateSnapshot` | stable-anchor seed |

Adjacent concepts: `backend.engine.lifecycle`, `hud.controller.state-application`

## network.state.transient-events

Owner: `networking.md` → **Transient events**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#buildGameStateSnapshot` | stable-anchor seed |

Adjacent concepts: `hud.overlays.score-popups`, `backend.engine.power-events`

