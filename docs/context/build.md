# Build and Release

Scope: private assets, client build inputs, Android/Web export, and the server
image. Runtime targets → [deployment.md](./deployment.md). File purposes and
stable anchors → [map/infra.md](./map/infra.md).

## Private assets

Production art stays outside the public repository. A committed manifest pins an
immutable, versioned R2 bundle by object name, hash, file count, and sentinels so
an old commit rebuilds against its original art. CI downloads with read-only R2
credentials and fails closed on hash, extraction, count, or sentinel mismatch.
Publishing remains a local manual operation with separate write credentials and
refuses to overwrite an existing version.

Bundles are deterministic. Godot `.import` files travel with their source images
because public scenes reference their UIDs; regenerating them in CI breaks those
references. An explicit art-version override bypasses hash verification and is
for unpublished test bundles only, never a release.

Shipped art is not secret: mobile packages and Web PCKs can be extracted. The
pipeline protects repository history and write access, not client-visible data.

## Godot asset import

Godot rasterizes SVG and PNG into imported textures, so runtime quality comes
from import scale, compression, and mipmaps rather than source extension. Import
defaults affect new files only; an existing asset retains its settings until it
is explicitly reimported. A new font must receive a headless/editor import pass
before a theme can load it.

Do not use an editor quit cycle as a parse check: it can resave scenes and discard
authored overrides. Use the repository smoke/import procedures instead.

## Android build

The Android workflow is a manual Google Play build. It fetches private art,
writes build-time endpoint/auth flags, installs the pinned Godot/Android toolchain,
builds native sign-in plugins, restores signing material, imports the project,
runs smoke and required GUT, exports a signed AAB, validates it, and optionally
publishes to the internal track.

Version code is resolved from every Play track and increments the highest known
value. An override must be a positive value above that maximum. The AAB gate
checks archive integrity, bundle/manifest presence, required architecture,
disabled-architecture absence, and signature validity.

The boot splash requires full-screen startup geometry to avoid a covered-image
crop; runtime then restores visible system bars. Changing startup window mode
requires a rendered device check, not a permanent pixel assertion.

## Endpoint and authentication injection

`write-endpoint-config.sh` regenerates the committed Godot endpoint configuration
before a client build. It owns primary/failover WebSocket targets, debug/demo
flags, Supabase public configuration, OAuth enablement and redirect, and native
provider identifiers. Empty optional values disable their feature; partial
Supabase configuration or OAuth without a project fails the build.

The Deeplink plugin receives Android OAuth redirects through its export
configuration and requires the Gradle export path. Native Google and Facebook
plugins are first-party build inputs; native failure falls back to browser OAuth.
Provider secrets remain server-side. Play signing certificates, not only the
upload key, must be registered with the provider project.

Every shipping CI workflow invokes endpoint generation. The flags are build-time
capabilities, not runtime hostname checks.

## Server image

The server Dockerfile installs dependencies and copies only the runtime app;
tests and tools do not ship. The same commit-SHA-tagged image runs on EKS and the
physical backup, with Redis and reconnect settings supplied by deployment.

Client/art secrets cover R2 read access, Android signing, and Google Play API
access. Infrastructure credentials remain scoped to deployment. Cloudflare Pages
cannot host the current Godot Web artifact because of its per-file size limit;
the physical backup is the Web target.
