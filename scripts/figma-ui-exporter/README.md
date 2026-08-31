# Corp Tower Figma UI Exporter

This local Figma Desktop development plugin exports one selected root `FRAME` as a private Phase 1 package. It has no network, REST, MCP, credential, analytics, or runtime-integration path.

## Setup and build

From this directory, install the isolated tool dependencies:

```bash
npm install
npm run test
```

Create a Figma development-plugin ID through Figma Desktop's **Plugins → Development → New Plugin…** flow. Keep the ID local by either passing it to packaging:

```bash
npm run package -- --plugin-id YOUR_FIGMA_PLUGIN_ID
```

or by creating the ignored `figma-plugin.local.json` file:

```json
{ "pluginId": "YOUR_FIGMA_PLUGIN_ID" }
```

Then run `npm run package`. This creates the ignored local plugin import path:

```text
scripts/figma-ui-exporter/dist/manifest.json
```

Import that manifest in Figma Desktop's **Plugins → Development → Import plugin from manifest…** flow. The same `dist/` directory contains `corp-tower-game-ui-exporter.zip` for local transfer or backup.

`npm run verify:manifest -- --manifest dist/manifest.json` checks that the generated manifest uses Figma-only editing, dynamic-page document access, and `networkAccess.allowedDomains: ["none"]`.

## V1 behavior

Select exactly one root `FRAME`, leave the PNG scale at its default `4x` (or choose `1x`, `2x`, or `3x`), then choose **Export UI Package**. The plugin downloads one deterministic ZIP containing:

```text
<Screen>/
  export-manifest.json
  figma.raw.json
  reference.png
  assets/
    *.png
```

Extract it beneath ignored `design-imports/`. `export-manifest.json` is schema version `1`; it preserves the selected screen and exported asset Figma node IDs exactly, records `JSON_REST_V1` as the raw format, and connects each PNG to its source ID, original name, scale, dimensions, deterministic path, and physical-export reason.

The raw JSON is the Plugin API's `JSON_REST_V1` result without normalization. V1 only detects physical PNG candidates: visible `VECTOR` nodes, visible boolean operations, visible image fills, and visible nodes tagged with `[asset]` in their name. It intentionally skips ordinary text, layout containers/backgrounds, hidden nodes, and all runtime/Godot classification.

## Manual smoke test

In Figma Desktop, select the **Private Lobby** root frame, run **Game UI Exporter**, keep `4x`, export, and extract the downloaded ZIP to `design-imports/PrivateLobby/`. Confirm the raw JSON and reference PNG exist, expected vector/image/tagged assets are PNGs under `assets/`, filenames are stable, duplicate names do not collide, the manifest preserves source IDs, selecting an invalid root gives a clear error, and changing scale changes the PNG export scale. Confirm Figma's developer console shows no network or CSP attempt.
