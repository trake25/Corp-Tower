// Single place for every identity/contact value on the site. Change it here,
// it changes in the nav, the hero, the contact block, the footer, and the
// structured data.
//
// The name/title/project strings live in profile.json rather than here because
// tools/generate-og.mjs draws the social preview image from the same values and
// is plain Node — JSON is the only format both it and TypeScript can read
// without a build step.
//
// Per-game links are NOT here. A game's play destinations and its repository
// live in that game's file under src/content/games/, so adding a game brings
// its own links with it and nothing site-wide has to be edited.
import identity from "./profile.json";

export const profile = {
  ...identity,
  location: null as string | null,
  email: "enriquedelapenajr@gmail.com",
  // Structured data only (schema.org `sameAs`) — there is no site-wide GitHub
  // button any more. Source links are per game.
  github: "https://github.com/trake25",
  // Contact destinations beyond email, rendered as buttons in section 03 in the
  // order given. Adding one is an entry here and nothing else. An entry with
  // `href: null` is skipped entirely, so a placeholder can sit in the list
  // until its URL exists.
  links: [
    { label: "LinkedIn", href: "https://www.linkedin.com/in/enrique-dela-pena-jr" },
    { label: "Indeed", href: null },
    { label: "itch.io", href: null },
    { label: "Add another", href: null },
  ] as { label: string; href: string | null }[],
  // Shown in the availability line. Set to null to hide the whole line.
  availability:
    "Open to Platform and DevOps roles, full-time or contract — agent-assisted workflows with minimal human intervention.",
} as const;
