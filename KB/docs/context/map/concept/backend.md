# Concept Map — backend

DRAFT GENERATED OUTPUT. The repository generator should validate every source target,
resolve stable anchors to current line numbers, and emit bounded source-read ranges.

## backend.authority.engine

Owner: `backend.md` → **Game Engine boundary**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#@file` | coarse `@file` seed — refine before activation |

## backend.authority.persistence

Owner: `backend.md` → **Persistence ownership**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/Redis_State.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.redis.leases`

## backend.authority.server

Owner: `backend.md` → **Server authority**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.adapters.boundaries`

## backend.bots.preview

Owner: `backend.md` → **Bot preview**

| Source seed | Status |
|---|---|
| `src/Server/app/Bot_Manager.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.bots.scoring`

## backend.config.values

Owner: `backend.md` → **Configuration ownership**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Config.js#@file` | coarse `@file` seed — refine before activation |

## backend.engine.last-chance

Owner: `backend.md` → **Last Chance authority**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Last_Chance.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.debug.last-chance`

## backend.engine.lifecycle

Owner: `backend.md` → **Engine lifecycle**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.state.snapshot`

## backend.engine.placement

Owner: `backend.md` → **Placement authority**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Placement.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.tower.placement`, `network.placement.contract`

## backend.engine.power-events

Owner: `backend.md` → **Power events**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.state.transient-events`

## backend.engine.timers

Owner: `backend.md` → **Engine timers**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.progression.timing`

## backend.identity.auth

Owner: `backend.md` → **Identity verification**

| Source seed | Status |
|---|---|
| `src/Server/app/Auth_Verifier.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.session.identity`

## backend.identity.profile

Owner: `backend.md` → **Durable profiles**

| Source seed | Status |
|---|---|
| `src/Server/app/Account_Store.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/Profile_Store.js#@file` | coarse `@file` seed — refine before activation |

## backend.impacts.requirement

Owner: `backend.md` → **Impact authority**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Impacts.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.impact.requirement`, `network.state.impact-status`

## backend.impacts.rollback

Owner: `backend.md` → **Impact rollback**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Impacts.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.progression.rollback`

## backend.lobby.active-leave

Owner: `backend.md` → **Intentional active leave**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.room.active-leave`

## backend.lobby.close

Owner: `backend.md` → **Terminal room close**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.room.close`

## backend.lobby.connection

Owner: `backend.md` → **Session connection ownership**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/Redis_State.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.session.supersession`

## backend.lobby.cross-pod

Owner: `backend.md` → **Cross-pod ownership**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/Redis_State.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.redis.leases`, `network.room.cross-pod`

## backend.lobby.debug-config

Owner: `backend.md` → **Debug configuration**

| Source seed | Status |
|---|---|
| `src/Server/app/Debug_Config.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.debug.tuning`

## backend.lobby.private

Owner: `backend.md` → **Private rooms**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.room.private`

## backend.lobby.public

Owner: `backend.md` → **Public matchmaking**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/Redis_State.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.room.public`

## backend.redis.hydration

Owner: `backend.md` → **Hydration continuity**

| Source seed | Status |
|---|---|
| `src/Server/app/Redis_State.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.state.snapshot`

## backend.redis.leases

Owner: `backend.md` → **Redis leases**

| Source seed | Status |
|---|---|
| `src/Server/app/Redis_State.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.lobby.cross-pod`

## backend.scoring.transaction

Owner: `backend.md` → **Scoring transaction**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Scoring.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.scoring.transaction`

## backend.stability.analysis

Owner: `backend.md` → **Support graph**

| Source seed | Status |
|---|---|
| `src/Server/app/Tower_Stability.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.tower.stability`

## backend.stability.collapse

Owner: `backend.md` → **Collapse authority**

| Source seed | Status |
|---|---|
| `src/Server/app/Tower_Stability.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/engine/Placement.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `hud.tower.collapse.presentation`, `gameplay.progression.failure`

## backend.stability.pose

Owner: `backend.md` → **Structural pose**

| Source seed | Status |
|---|---|
| `src/Server/app/Tower_Stability.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `hud.tower.pose`

## backend.supply.authority

Owner: `backend.md` → **Supply authority**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Block_Supply.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.supply.reserve`

