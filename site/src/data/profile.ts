// Single place for every identity/contact value on the site. Change it here,
// it changes in the nav, the hero, the contact block, the footer, and the
// structured data. Set a value to null to drop that link everywhere.
//
// The name/title/project strings live in profile.json rather than here because
// tools/generate-og.mjs draws the social preview image from the same values and
// is plain Node — JSON is the only format both it and TypeScript can read
// without a build step. `repo` stays hardcoded: the repository still carries
// the project's working name (Corp-Tower), so it is not derived from `project`.
import identity from "./profile.json";

export const profile = {
  ...identity,
  location: null as string | null,
  email: "enriquedelapenajr@gmail.com",
  github: "https://github.com/trake25",
  repo: "https://github.com/trake25/Corp-Tower",
  linkedin: null as string | null,
  demo: "https://toddemo.galaxxigames.com",
  // Shown in the availability line. Set to null to hide the whole line.
  availability:
    "Open to platform / DevOps roles, and to contract work automating delivery pipelines and agent-assisted workflows.",
} as const;

// Each tile states an outcome, not an inventory count — the raw number lives
// in the sub-line where it belongs as evidence.
export const stats = [
  {
    value: "$0",
    label: "idle cloud spend",
    sub: "the production stack exists only while it is in use",
  },
  {
    value: "0",
    label: "manual deploy steps",
    sub: "34 workflows own every path to every target",
  },
  {
    value: "1",
    label: "image, 3 targets",
    sub: "production, lab and dev run the identical build",
  },
] as const;
