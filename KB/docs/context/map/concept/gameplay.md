# Concept Map — gameplay

DRAFT GENERATED OUTPUT. The repository generator should validate every source target,
resolve stable anchors to current line numbers, and emit bounded source-read ranges.

## gameplay.bots.calibration

Owner: `gameplay.md` → **Bot calibration limit**

| Source seed | Status |
|---|---|
| `src/Server/app/Bot_Manager.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `testing.balance.tools`

## gameplay.bots.cooperative

Owner: `gameplay.md` → **Cooperative bot behavior**

| Source seed | Status |
|---|---|
| `src/Server/app/Bot_Manager.js#@file` | coarse `@file` seed — refine before activation |

## gameplay.bots.scoring

Owner: `gameplay.md` → **Bot scoring policy**

| Source seed | Status |
|---|---|
| `src/Server/app/Bot_Manager.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.bots.preview`

## gameplay.core.loop

Owner: `gameplay.md` → **Core loop**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.impact.requirement`, `gameplay.progression.failure`

## gameplay.debug.last-chance

Owner: `gameplay.md` → **Last Chance**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Last_Chance.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.engine.last-chance`

## gameplay.debug.tuning

Owner: `gameplay.md` → **Debug tuning**

| Source seed | Status |
|---|---|
| `src/Server/app/Debug_Config.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/Game_Config.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.lobby.debug-config`

## gameplay.impact.checkpoint-credit

Owner: `gameplay.md` → **Checkpoint credit**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Impacts.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.scoring.exact-finish`

## gameplay.impact.eligible

Owner: `gameplay.md` → **Eligible contribution**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Impacts.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/engine/Scoring.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.state.impact-status`

## gameplay.impact.requirement

Owner: `gameplay.md` → **Personal requirement**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Impacts.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/engine/Scoring.js#@file` | coarse `@file` seed — refine before activation |

## gameplay.power.inventory

Owner: `gameplay.md` → **Power inventory**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/engine/Impacts.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.progression.rollback`

## gameplay.power.replenish

Owner: `gameplay.md` → **Replenish**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/engine/Block_Supply.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.supply.reserve`

## gameplay.progression.failure

Owner: `gameplay.md` → **Failure rules**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Engine.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/engine/Placement.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/engine/Impacts.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.supply.reserve`, `gameplay.impact.requirement`

## gameplay.progression.rollback

Owner: `gameplay.md` → **Impact rollback**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Impacts.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.impact.requirement`, `backend.impacts.rollback`

## gameplay.progression.timing

Owner: `gameplay.md` → **Round timing**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Config.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/Game_Engine.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.engine.timers`, `network.session.recovery`

## gameplay.scoring.critical-save

Owner: `gameplay.md` → **Critical Save**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Scoring.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.tower.stability`, `hud.tower.weak-support`

## gameplay.scoring.exact-finish

Owner: `gameplay.md` → **Exact finish**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Scoring.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/engine/Impacts.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.impact.checkpoint-credit`

## gameplay.scoring.height

Owner: `gameplay.md` → **Height**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Scoring.js#@file` | coarse `@file` seed — refine before activation |

## gameplay.scoring.recovery

Owner: `gameplay.md` → **Recovery**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Scoring.js#@file` | coarse `@file` seed — refine before activation |

## gameplay.scoring.reinforcement

Owner: `gameplay.md` → **Reinforcement**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Scoring.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.tower.stability`, `gameplay.scoring.critical-save`

## gameplay.scoring.transaction

Owner: `gameplay.md` → **Placement transaction**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Scoring.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.scoring.transaction`

## gameplay.session.reconnect

Owner: `gameplay.md` → **Reconnect meaning**

| Source seed | Status |
|---|---|
| `src/Server/app/Lobby_Manager.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.session.recovery`

## gameplay.supply.bricks

Owner: `gameplay.md` → **Brick dealing**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Block_Supply.js#@file` | coarse `@file` seed — refine before activation |

## gameplay.supply.carry-over

Owner: `gameplay.md` → **Carry-over**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Block_Supply.js#@file` | coarse `@file` seed — refine before activation |

## gameplay.supply.reserve

Owner: `gameplay.md` → **Shared supply**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Block_Supply.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/engine/Placement.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `gameplay.power.replenish`, `gameplay.progression.failure`

## gameplay.tower.placement

Owner: `gameplay.md` → **Release row and gravity**

| Source seed | Status |
|---|---|
| `src/Server/app/engine/Placement.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.placement.contract`, `hud.placement.snapping`

## gameplay.tower.pose

Owner: `gameplay.md` → **Structural pose meaning**

| Source seed | Status |
|---|---|
| `src/Server/app/Tower_Stability.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `hud.tower.pose`

## gameplay.tower.site

Owner: `gameplay.md` → **Placeable site**

| Source seed | Status |
|---|---|
| `src/Server/app/Game_Config.js#@file` | coarse `@file` seed — refine before activation |
| `src/Server/app/engine/Placement.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.state.grid-site`

## gameplay.tower.stability

Owner: `gameplay.md` → **Stability design**

| Source seed | Status |
|---|---|
| `src/Server/app/Tower_Stability.js#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.stability.analysis`, `gameplay.scoring.reinforcement`, `gameplay.scoring.critical-save`

