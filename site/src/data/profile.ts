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
  // City-level and no further. It is what a recruiter needs to settle timezone
  // and work authorisation in one glance; a street address is not something a
  // portfolio ever has a reason to carry.
  location: "Metro Manila, Philippines" as string | null,
  // Long form, for the hero facts row where there is room for it.
  locationFull: "Metro Manila, National Capital Region, Philippines",
  timezone: "UTC+8",
  // An alias on the domain, routed to the personal inbox by Cloudflare Email
  // Routing — deliberately not the Gmail address behind it. This one is
  // published in plain text and in the JSON-LD, so it will be scraped; the
  // point is that what gets scraped is disposable. The address behind it is
  // also the Google account recovery address, which is not something to hand
  // out with a public tool stack sitting next to it.
  //
  // Routing forwards but does not send: replies leave from the personal
  // address. That is fine against scraping and is not a send-as solution.
  email: "hire@galaxxigames.com",
  // Also used for schema.org `sameAs`. The per-game repo links stay per game —
  // this is the profile, which is a different thing and the one a platform
  // recruiter goes looking for. BaseLayout dedupes the two.
  github: "https://github.com/trake25",
  // Contact destinations beyond email, rendered as buttons in section 03 in the
  // order given. Adding one is an entry here and nothing else. An entry with
  // `href: null` is skipped entirely, so a placeholder can sit in the list
  // until its URL exists.
  links: [
    { label: "GitHub", href: "https://github.com/trake25" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/enrique-dela-pena-jr" },
    { label: "Indeed", href: null },
    { label: "itch.io", href: null },
    { label: "Add another", href: null },
  ] as { label: string; href: string | null }[],
  // The downloadable CV. Served from site/public/ rather than R2 on purpose: it
  // deploys with the site, versions in git, and needs no second credential or
  // deploy path for a file that changes when the site does.
  //
  // What goes in that PDF is a security decision, not a formatting one. City
  // and country, email, LinkedIn — and no street address and no phone number.
  // Nothing an ATS needs is missing, and there is then nothing on the file
  // worth gating. The version carrying a phone number goes out by email, to
  // someone who has already made contact.
  //
  // `href: null` hides the button, same convention as `links` above. Keep it
  // null until the file actually exists at that path.
  cv: {
    href: "/cv/Enrique-Dela-Pena-Jr-CV.pdf" as string | null,
    label: "Download CV (PDF)",
    updated: "August 2026",
  },
  // Public base URL of the R2 bucket holding the screen recordings. Clips are
  // the one asset class that does NOT ship with the site: they are tens of
  // megabytes each, they would put binaries in git history, and Workers Static
  // Assets caps a single file at 25 MiB. Keeping them behind one constant means
  // moving buckets or putting a custom domain in front of one is a single edit
  // here, not a find-and-replace across every content file.
  //
  // Content files carry a bucket-relative path ("clips/cloud-apply.mp4"); an
  // entry that already starts with http:// or https:// is used as written, so
  // an occasional externally hosted clip still works. No trailing slash.
  mediaBase: "https://media.galaxxigames.com",
  // Shown in the availability line. Set to null to hide the whole line.
  // Says what the hero facts cannot fit rather than repeating them: the same
  // role targets and the same remote/hybrid position, plus the working window.
  // Timezone notation is UTC+8 in both places on purpose — one page should not
  // switch between UTC and GMT halfway down.
  availability:
    "Open to Platform, Cloud and DevOps roles, full-time or contract — including teams building agent-assisted delivery workflows. Remote preferred, hybrid possible in the Philippines. Working hours 5 AM – 8 PM (UTC+8).",
} as const;
