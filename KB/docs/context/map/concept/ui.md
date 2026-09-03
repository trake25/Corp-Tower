# Concept Map — ui

DRAFT GENERATED OUTPUT. The repository generator should validate every source target,
resolve stable anchors to current line numbers, and emit bounded source-read ranges.

## ui.auth.presentation

Owner: `ui.md` → **Authentication screen**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/SignInScreen.tscn#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.session.identity`, `build.endpoint-auth.injection`

## ui.constraint.pointer-input

Owner: `ui.md` → **Pointer pass-through**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/Main.tscn#@file` | coarse `@file` seed — refine before activation |

## ui.constraint.rendered-verification

Owner: `ui.md` → **Rendered verification**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/Main.tscn#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `testing.client.rendered`

## ui.constraint.scene-order

Owner: `ui.md` → **Scene text-format constraint**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/Main.tscn#@file` | coarse `@file` seed — refine before activation |

## ui.debug.entry

Owner: `ui.md` → **Debug entry**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scripts/DebugOverlay.gd#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `backend.lobby.debug-config`

## ui.home.navigation

Owner: `ui.md` → **Home**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/HomeScreen.tscn#@file` | coarse `@file` seed — refine before activation |

## ui.navigation.server-routes

Owner: `ui.md` → **Server-driven navigation**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scripts/ScreenManager.gd#@file` | coarse `@file` seed — refine before activation |
| `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.room.close`, `network.session.resume-only`

## ui.play.menu

Owner: `ui.md` → **Play Menu**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/MenuScreen.tscn#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `hud.controller.state-application`

## ui.play.recovery

Owner: `ui.md` → **Active-match recovery**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/Main.tscn#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.session.recovery`

## ui.private-lobby.presentation

Owner: `ui.md` → **Private Lobby presentation**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/PrivateLobbyScreen.tscn#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.room.private`

## ui.private.create

Owner: `ui.md` → **Private Server creation**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/PrivateServerScreen.tscn#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.room.private`

## ui.private.join

Owner: `ui.md` → **Join Server**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/JoinScreen.tscn#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.room.private`

## ui.public-lobby.flow

Owner: `ui.md` → **Public matchmaking and lobby**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/PublicLobbyScreen.tscn#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.room.public`

## ui.settings.presentation

Owner: `ui.md` → **Settings**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/SettingsScreen.tscn#@file` | coarse `@file` seed — refine before activation |

## ui.shell.core

Owner: `ui.md` → **Client shell**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/Main.tscn#@file` | coarse `@file` seed — refine before activation |
| `src/Client/App/corp-tower/Cor/Scripts/ScreenManager.gd#@file` | coarse `@file` seed — refine before activation |

## ui.shell.responsive

Owner: `ui.md` → **Responsive root**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/Main.tscn#@file` | coarse `@file` seed — refine before activation |

## ui.startup.restoration

Owner: `ui.md` → **Startup restoration**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/Main.tscn#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `network.session.resume-only`, `ui.startup.splash`

## ui.startup.splash

Owner: `ui.md` → **Startup Splash**

| Source seed | Status |
|---|---|
| `src/Client/App/corp-tower/Cor/Scenes/Main.tscn#@file` | coarse `@file` seed — refine before activation |

Adjacent concepts: `build.android.startup-splash`, `ui.startup.restoration`

