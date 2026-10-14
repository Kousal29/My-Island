export interface DocTemplate {
  id: string;
  label: string;
  icon: string;
  title: string;
  body: () => string;
}

const today = () => new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

export const DOC_TEMPLATES: DocTemplate[] = [
  { id: "blank", label: "Blank doc", icon: "pen", title: "", body: () => "" },
  {
    id: "brief",
    label: "Project brief",
    icon: "rocket",
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
    icon: "book",
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
    icon: "calendar",
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
    icon: "sun",
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
    icon: "flask",
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
