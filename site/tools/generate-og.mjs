// Draws public/og.png — the 1200x630 thumbnail LinkedIn, Slack, WhatsApp and X
// show when someone pastes a link to the site. Runs automatically as npm's
// `prebuild` hook, so the image can never drift from src/data/profile.json and
// nobody has to remember a screenshot step.
//
// Everything is left-aligned and generously spaced on purpose: this renders
// through libvips on Windows locally and on Ubuntu in CI, which resolve fonts
// to different faces with different metrics. Left alignment means a wider face
// shifts nothing, and the sizes below leave ~15% slack on the longest line.
//
// The stacks name real families rather than the CSS generics: `sans-serif` and
// `monospace` are resolved by fontconfig here, not by a browser, and it maps
// them inconsistently across machines — asking for `sans-serif` produced a
// monospace face locally. Arial/Helvetica cover Windows, DejaVu/Liberation
// cover the Ubuntu runner.

import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "public/og.png");

const profile = JSON.parse(
  await readFile(resolve(root, "src/data/profile.json"), "utf8")
);

const required = ["name", "title", "project", "projectShort", "site", "ogTagline", "ogStats"];
const missing = required.filter((key) => !profile[key]);
if (missing.length > 0) {
  throw new Error(`profile.json is missing required OG field(s): ${missing.join(", ")}`);
}

const esc = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const host = profile.site.replace(/^https?:\/\//, "").replace(/\/$/, "");

const SANS = "Arial, Helvetica, &apos;DejaVu Sans&apos;, &apos;Liberation Sans&apos;, sans-serif";
const MONO = "Consolas, &apos;DejaVu Sans Mono&apos;, &apos;Liberation Mono&apos;, monospace";

// There is no text measurement available here — libvips lays the SVG out, and
// this script has already produced the string by then. So width is estimated
// from character count and shrunk to fit rather than allowed to run off the
// canvas: a longer name or tagline in profile.json gets a smaller size instead
// of a clipped one. `ratio` is average glyph width as a fraction of font size;
// uppercase and bold run wider, hence the different values at the call sites.
const fit = (text, maxWidth, maxSize, ratio) =>
  Math.min(maxSize, Math.floor(maxWidth / Math.max(1, text.length * ratio)));

const CONTENT_WIDTH = 1040;
const nameSize = fit(profile.name, CONTENT_WIDTH, 80, 0.66);
const taglineSize = fit(profile.ogTagline, CONTENT_WIDTH, 33, 0.52);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="0.12" cy="0.06" r="0.9">
      <stop offset="0%" stop-color="#4fd6a4" stop-opacity="0.16" />
      <stop offset="100%" stop-color="#4fd6a4" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="#08090c" />
  <rect width="1200" height="630" fill="url(#glow)" />
  <rect x="0" y="0" width="1200" height="6" fill="#4fd6a4" />

  <rect x="80" y="84" width="22" height="22" rx="4" fill="#4fd6a4" />
  <text x="122" y="103" fill="#4fd6a4" font-family="${MONO}" font-size="23" font-weight="600" letter-spacing="3.4">${esc(profile.title.toUpperCase())}</text>

  <text x="80" y="238" fill="#eef1f5" font-family="${SANS}" font-size="${nameSize}" font-weight="700" letter-spacing="-1.5">${esc(profile.name)}</text>

  <text x="80" y="312" fill="#eef1f5" font-family="${SANS}" font-size="30" font-weight="600">${esc(profile.project)} (${esc(profile.projectShort)})</text>
  <text x="80" y="356" fill="#949cab" font-family="${SANS}" font-size="${taglineSize}">${esc(profile.ogTagline)}</text>

  <rect x="80" y="432" width="1040" height="1" fill="#21262f" />

  ${profile.ogStats
    .map((stat, index) => {
      const [value, ...rest] = String(stat).split(" ");
      const x = 80 + index * 350;
      return `<text x="${x}" y="502" fill="#4fd6a4" font-family="${MONO}" font-size="36" font-weight="600">${esc(value)}</text>
  <text x="${x}" y="538" fill="#6b7280" font-family="${SANS}" font-size="23">${esc(rest.join(" "))}</text>`;
    })
    .join("\n  ")}

  <text x="80" y="594" fill="#6b7280" font-family="${MONO}" font-size="22" letter-spacing="0.6">${esc(host)}</text>
</svg>`;

mkdirSync(resolve(root, "public"), { recursive: true });
const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
await writeFile(out, png);

console.log(`generate-og: wrote public/og.png (${(png.length / 1024).toFixed(0)} kB)`);
