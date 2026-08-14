// Refreshes src/data/demo-stats.json from the game server's public
// /api/stats/demo route — bakes a point-in-time completion-rate number into
// the site at build time. Runs as part of npm's `prebuild` hook, alongside
// generate-og.mjs.
//
// Fails soft on purpose: this is a decorative stat, not build-critical data.
// If DEMO_STATS_API_URL isn't set, or the server is unreachable during a CI
// build, the script keeps whatever value is already committed rather than
// failing the build or writing zeros over a good number.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "src/data/demo-stats.json");
const url = process.env.DEMO_STATS_API_URL;

const previous = await readFile(out, "utf8")
  .then(JSON.parse)
  .catch(() => ({ available: false, completed: 0, attempted: 0, updatedAt: null }));

if (!url) {
  console.log("fetch-demo-stats: DEMO_STATS_API_URL not set, keeping last known value");
  process.exit(0);
}

try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`server responded ${response.status}`);
  }

  const { completed, attempted } = await response.json();

  await writeFile(
    out,
    JSON.stringify(
      {
        available: true,
        completed: Number(completed) || 0,
        attempted: Number(attempted) || 0,
        updatedAt: new Date().toISOString()
      },
      null,
      2
    ) + "\n"
  );

  console.log(`fetch-demo-stats: wrote ${completed}/${attempted} (completed/attempted)`);
} catch (error) {
  console.log(`fetch-demo-stats: fetch failed (${error.message}), keeping last known value`);
  await writeFile(out, JSON.stringify(previous, null, 2) + "\n");
}
