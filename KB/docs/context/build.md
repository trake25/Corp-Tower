# Build and Release

Scope: private assets, client build inputs, Android/Web export, endpoint/auth injection, and server image construction.

<!-- kb
id: build.art.private-bundle
alias: private art
alias: R2 art bundle
source: scripts/art-common.sh#pack_art
source: scripts/art-push.sh#versions are immutable
-->
## Private art bundle

Production art remains outside public repository history. A committed manifest pins an immutable versioned R2 bundle by object name, hash, file count, and sentinels so historical commits rebuild against their intended art. CI read access and local publishing write access remain separate.

<!-- kb
id: build.godot.asset-import
alias: Godot import
alias: font import
source: src/Client/App/corp-tower/project.godot#importer_defaults
-->
## Godot asset import

Godot runtime quality for SVG/PNG comes from import scale, compression, and mipmap settings rather than source extension. Existing assets retain import settings until reimported. New fonts require an import pass before a theme can load them.

<!-- kb
id: build.android.pipeline
alias: Android CI
alias: AAB build
source: .github/workflows/Android-Deploy-wstodplay.yml#build-android
adjacent: testing.release.gates
-->
## Android pipeline

The Android workflow downloads private art, writes build-time endpoint/auth capabilities, installs the pinned Godot/Android toolchain, builds native sign-in plugins, restores signing material, imports the project, runs smoke/GUT, exports a signed AAB, validates it, and may publish to the Play internal track.

<!-- kb
id: build.android.version-code
alias: versionCode
alias: Play track version
source: .github/workflows/Android-Deploy-wstodplay.yml#Resolve Google Play version code
-->
## Play version code

Android version code is resolved from existing Play tracks and increments the highest known value. An override must be positive and above the known maximum; it does not substitute for target-SDK validation.

<!-- kb
id: build.android.aab-validation
alias: bundle validation
alias: target SDK
source: .github/workflows/Android-Deploy-wstodplay.yml#Validate signed Android AAB deployment artifact
-->
## AAB validation

The AAB gate validates archive structure, required bundle/manifest entries, architecture presence/absence, signature, and target SDK from the base manifest before publication.

<!-- kb
id: build.android.startup-splash
alias: Android splash crop
alias: Android extended splash
source: src/Client/App/corp-tower/project.godot#boot_splash/stretch_mode.mobile
adjacent: ui.startup.splash
adjacent: testing.client.rendered
-->
## Startup splash

Android boot/extended splash requires full startup viewport geometry to avoid covered-image crop. Runtime restores normal system-bar behavior after handoff. Startup geometry changes require rendered device verification instead of permanent pixel assertions.

<!-- kb
id: build.endpoint-auth.injection
alias: write endpoint config
alias: auth injection
source: scripts/write-endpoint-config.sh#CONFIG_FILE
adjacent: ui.auth.presentation
adjacent: network.session.identity
-->
## Endpoint and auth injection

Build-time endpoint generation selects one WebSocket target plus debug/demo flags and public auth/provider capabilities. Empty optional values disable their feature; incomplete required combinations fail the build. Shipping workflows use generated configuration rather than runtime hostname guesses.

<!-- kb
id: build.auth.native-providers
alias: native Google sign in
alias: native Facebook
source: .github/workflows/Android-Deploy-wstodplay.yml#Validate native sign-in plugin artifacts
-->
## Native provider build inputs

Android native Google/Facebook plugins are first-party build inputs with browser OAuth fallback. Provider secrets remain server-side, and provider projects must recognize the Play signing certificate as well as the upload key.

<!-- kb
id: build.server.image
alias: server Dockerfile
alias: server image
source: src/Server/Dockerfile#COPY app/ ./
adjacent: deploy.eks.topology
adjacent: deploy.backup.topology
-->
## Server image

The server Docker image installs runtime dependencies and copies only the shipping application; tests/tools do not ship. The same commit-SHA-tagged image is used by EKS and the physical backup with environment-specific Redis/auth configuration supplied at deployment.
