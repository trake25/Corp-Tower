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

const required = ["name", "title", "project", "projectShort", "site", "ogTagline"];
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
const nameSize = fit(profile.name, CONTENT_WIDTH, 84, 0.66);

// The tagline is the only long line left on the card, so it gets two lines to
// work with rather than being shrunk to nothing. Split on the last space before
// the halfway mark so the two lines come out roughly even.
const wrap = (text, maxChars) => {
  if (text.length <= maxChars) return [text];
  const cut = text.lastIndexOf(" ", Math.ceil(text.length / 2) + 8);
  return cut === -1 ? [text] : [text.slice(0, cut), text.slice(cut + 1)];
};

const taglineLines = wrap(profile.ogTagline, 58);
const taglineSize = fit(
  taglineLines.reduce((longest, line) => (line.length > longest.length ? line : longest), ""),
  CONTENT_WIDTH,
  32,
  0.52
);

// Mono Slate, matching src/styles/global.css. Brass (#c9a227) marks; slate
// neutrals carry everything else. Kept in sync by hand — this file is plain
// Node and cannot read the stylesheet's custom properties.
const INK = "#f0f2f4";
const MUTED = "#a3abb5";
const FAINT = "#6f7883";
const LINE = "#242a32";
const GROUND = "#101215";
const MARK = "#c9a227";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="0.12" cy="0.06" r="0.9">
      <stop offset="0%" stop-color="${MARK}" stop-opacity="0.13" />
      <stop offset="100%" stop-color="${MARK}" stop-opacity="0" />
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="${GROUND}" />
  <rect width="1200" height="630" fill="url(#glow)" />
  <rect x="0" y="0" width="1200" height="5" fill="${MARK}" />

  <rect x="80" y="84" width="20" height="20" rx="3" fill="${MARK}" />
  <text x="120" y="102" fill="${MARK}" font-family="${MONO}" font-size="23" font-weight="600" letter-spacing="3.4">${esc(profile.title.toUpperCase())}</text>

  <text x="80" y="262" fill="${INK}" font-family="${SANS}" font-size="${nameSize}" font-weight="700" letter-spacing="-1.5">${esc(profile.name)}</text>

  <text x="80" y="336" fill="${INK}" font-family="${SANS}" font-size="30" font-weight="600">${esc(profile.project)} (${esc(profile.projectShort)})</text>
  ${taglineLines
    .map((line, index) => `<text x="80" y="${384 + index * 42}" fill="${MUTED}" font-family="${SANS}" font-size="${taglineSize}">${esc(line)}</text>`)
    .join("\n  ")}

  <rect x="80" y="508" width="1040" height="1" fill="${LINE}" />

  <text x="80" y="556" fill="${FAINT}" font-family="${MONO}" font-size="22" letter-spacing="0.6">${esc(host)}</text>
</svg>`;

mkdirSync(resolve(root, "public"), { recursive: true });
const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
await writeFile(out, png);

console.log(`generate-og: wrote public/og.png (${(png.length / 1024).toFixed(0)} kB)`);
