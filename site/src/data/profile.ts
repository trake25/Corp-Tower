// Single place for every identity/contact value on the site. Change it here,
// it changes in the nav, the hero, the contact block, the footer, and the
// structured data. Set a value to null to drop that link everywhere.

export const profile = {
  name: "Enrique de la Peña",
  shortName: "En",
  title: "Cloud · DevOps · Platform · AI Automation",
  location: null as string | null,
  email: "enriquedelapenajr@gmail.com",
  github: "https://github.com/trake25",
  repo: "https://github.com/trake25/Corp-Tower",
  linkedin: null as string | null,
  demo: "https://toddemo.galaxxigames.com",
  site: "https://enportfolio.galaxxigames.com",
  // Shown in the availability line. Set to null to hide the whole line.
  availability:
    "Open to platform / DevOps roles, and to contract work automating delivery pipelines and agent-assisted workflows.",
} as const;

export const stats = [
  { value: "3", label: "environments", sub: "one container image" },
  { value: "34", label: "CI/CD workflows", sub: "no manual deploy steps" },
  { value: "1", label: "engineer", sub: "design, build, operate" },
  { value: "$0", label: "idle cloud spend", sub: "validation stack auto-destroys" },
] as const;
