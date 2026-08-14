// Every identity and contact value on the site. Change it here and it changes
// in the nav, hero, contact block, footer and structured data. What belongs in
// each field, and why: site/docs/content.md.
//
// Name, titles and project strings live in profile.json instead, because
// tools/generate-og.mjs reads the same values and is plain Node.
//
// Per-game links are not here — they live in that game's content file.
//
// `title` and `jobTitle` hold the same string on purpose, not by accident:
// `title` feeds the footer and the OG-image alt text, `jobTitle` feeds the
// page <title>, the meta description and the JSON-LD `jobTitle` property.
// Keep both in sync by hand rather than collapsing them — doing that would
// mean reworking BaseLayout.astro's JSON-LD wiring and generate-og.mjs.
import identity from "./profile.json";

export const profile = {
  ...identity,
  // City-level and no further.
  location: "Metro Manila, Philippines" as string | null,
  // Long form, for the hero facts row.
  locationFull: "Metro Manila, National Capital Region, Philippines",
  timezone: "UTC+8",
  // A domain alias routed to the personal inbox, never the address behind it.
  // This one ships in plain text and in the JSON-LD, so it will be scraped.
  // Routing forwards but does not send.
  email: "hire@galaxxigames.com",
  // Also published as schema.org `sameAs`; BaseLayout dedupes it against links.
  github: "https://github.com/trake25",
  // Contact destinations beyond email, rendered in this order. An entry with
  // `href: null` is skipped, so a placeholder can wait for its URL.
  links: [
    { label: "GitHub", href: "https://github.com/trake25" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/enrique-dela-pena-jr" },
    { label: "Indeed", href: null },
    { label: "itch.io", href: null },
    { label: "Add another", href: null },
  ] as { label: string; href: string | null }[],
  // Served from site/public/, not R2: it deploys with the site and versions in
  // git. What goes in the PDF is a security decision — see content.md.
  // `href: null` hides the button; keep it null until the file exists.
  cv: {
    href: "/cv/Enrique-Dela-Pena-Jr-CV.pdf" as string | null,
    label: "Download CV (PDF)",
    updated: "August 2026",
  },
  // Public base URL of the R2 bucket holding the screen recordings. Content
  // files carry a bucket-relative path; an http(s) value is used as written.
  // No trailing slash.
  mediaBase: "https://media.galaxxigames.com",
  // The literal string rendered in index.astro's #lets-talk availability
  // line. Set to null to hide the whole line.
  availability: "Open to Platform & DevOps roles.",
} as const;
