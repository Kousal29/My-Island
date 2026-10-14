export interface DocTemplate {
  id: string;
  label: string;
  emoji: string;
  title: string;
  body: () => string;
}

const today = () => new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export const DOC_TEMPLATES: DocTemplate[] = [
  { id: "blank", label: "Blank doc", emoji: "📝", title: "", body: () => "" },
  {
    id: "brief",
    label: "Project brief",
    emoji: "🚀",
    title: "Project brief",
    body: () => `## Goal
What are we building and why?

## Scope
- In:
- Out:

## Milestones
- [ ] Kickoff
- [ ] First prototype
- [ ] Launch

## Links
- Repo:
- Design:
`,
  },
  {
    id: "readme",
    label: "README / docs",
    emoji: "📘",
    title: "README",
    body: () => `# Overview
One paragraph on what this is.

## Setup
\`\`\`sh
npm install
npm run dev
\`\`\`

## Architecture
-

## Decisions
> Why we chose X over Y.
`,
  },
  {
    id: "meeting",
    label: "Meeting notes",
    emoji: "🗓️",
    title: `Meeting — ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    body: () => `**Date:** ${today()}
**Attendees:**

## Agenda
1.

## Notes
-

## Action items
- [ ]
`,
  },
  {
    id: "daily",
    label: "Daily log",
    emoji: "☀️",
    title: `Log — ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    body: () => `## Today
- [ ]

## Wins
-

## Blockers
-
`,
  },
  {
    id: "research",
    label: "Research notes",
    emoji: "🔬",
    title: "Research",
    body: () => `## Question
What are we trying to learn?

## Sources
-

## Findings
-

## Next steps
- [ ]
`,
  },
];
