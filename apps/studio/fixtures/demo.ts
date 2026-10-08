// A demo's data (`?demo=1`): the same fixture pages, telling one coherent project, so a recording looks like the
// Studio at work rather than its checks. Every name, number and source is invented, and the page still says the data
// is simulated. Without `demo`, nothing here is used and every page is exactly as its checks expect.

/** Whether the page asked for the demo. Pages only: the checks import these modules under Node, with no `location`. */
export const DEMO = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo')

/**
 * The version the demo's report is on: its second, both published, unless `versions=1` publishes only the first. The
 * research and what the conversation made name the same one.
 */
export const DEMO_VERSION: 1 | 2 = DEMO && new URLSearchParams(window.location.search).get('versions') !== '1' ? 2 : 1

/** The project. */
export const DEMO_PROJECT = 'Onboarding pilot'

/** The project's name on every page: the demo's, or the fixture's. */
export const PROJECT_NAME = DEMO ? DEMO_PROJECT : 'Fixture project'

/** The viewer's name in the records: the demo's, or the fixture's. */
export const VIEWER_NAME = DEMO ? 'Luis' : 'Fixture viewer'

/** The label every fixture page carries: in the demo, still saying the data is simulated. */
export const DEMO_LABEL = 'Demo · simulated data'

/** The project Home and Personal know by name. */
export const HOME_PROJECT = DEMO ? DEMO_PROJECT : 'Product launch'

/** The project's direction, as its brief states it. */
export const DEMO_STATEMENT = 'Bring every new team to a first shared report inside its first week.'

/** The report's title. */
export const DEMO_TITLE = 'Pilot readout: what kept 12 of 14 teams'

/** What Sophia was asked to research. */
export const DEMO_QUESTION =
  'Why did 12 of the 14 pilot teams stay active after four weeks, why did two leave in week three, and what should we change before the rollout?'

/** The sources the report cites: the project's own records, read in full. */
export const DEMO_SOURCES = [
  { id: '00000000-0000-4000-8000-0000000000fb', title: 'Week-3 pilot survey · 11 of 14 teams answered' },
  { id: '00000000-0000-4000-8000-0000000000fc', title: 'Support tickets raised in the pilot · Sep 1–28' },
  { id: '00000000-0000-4000-8000-0000000000fd', title: 'Onboarding call notes · 14 first sessions' },
  { id: '00000000-0000-4000-8000-0000000000fe', title: 'Activation dashboard · September snapshot' },
] as const

const [SURVEY, TICKETS, CALLS, DASHBOARD] = DEMO_SOURCES.map((s) => s.id)

/**
 * Where the report's sources came from (A19, proposed; docs/plans/knowledge-origins.md): the survey a file Lucía added,
 * the tickets a conversation about setup, the call notes the Oct 4 meeting, the dashboard a decision.
 */
export const DEMO_ORIGINS = [
  {
    sourceId: SURVEY ?? '',
    kind: 'file',
    id: '00000000-0000-4000-8000-0000000007a1',
    title: 'week-3-survey.csv',
    by: 'Lucía',
    at: '2026-09-29T10:00:00.000Z',
  },
  {
    sourceId: TICKETS ?? '',
    kind: 'conversation',
    id: '00000000-0000-4000-8000-0000000000c3',
    title: 'Who owns setup when an admin changes?',
    by: null,
    at: '2026-10-04T09:00:00.000Z',
  },
  {
    sourceId: CALLS ?? '',
    kind: 'meeting',
    id: '00000000-0000-4000-8000-0000000000e2',
    title: null,
    by: null,
    at: '2026-10-04T15:00:00.000Z',
  },
  {
    sourceId: DASHBOARD ?? '',
    kind: 'decision',
    id: '00000000-0000-4000-8000-0000000007a2',
    title: 'Read activation from the September snapshot',
    by: null,
    at: '2026-09-30T12:00:00.000Z',
  },
] as const

const MEASURED = `## What we measured

Fourteen customer teams took the new onboarding between September 1 and 28, nine in the first region and five in the second. We read the week-3 survey [${String(SURVEY)}], every support ticket the pilot raised [${String(TICKETS)}], the notes from each first session [${String(CALLS)}] and the activation dashboard [${String(DASHBOARD)}].

| Measure | Pilot | Previous onboarding |
| --- | --- | --- |
| Active after four weeks | 12 of 14 (86%) | 71% |
| Days to a first shared report | 2.4 | 6.1 |
| Setup tickets per team | 1.3 | 3.8 |
`

const KEPT = `## What kept teams

- **The shorter checklist.** All nine teams that finished its five steps in their first session were still active in week four [${String(CALLS)}].
- **A named owner.** Every team that stayed had one person who answered setup questions inside a day [${String(SURVEY)}].
- **A first report early.** Teams that shared a report in their first week were the most active in week four, with three times the sessions of the rest [${String(DASHBOARD)}].
`

const LEFT = `## Why two teams left

Both changed their admin in week three. The new admins never saw the setup checklist, and their first tickets waited more than two working days for an answer [${String(TICKETS)}].
`

const CONCLUSION = `## Conclusion

The shorter checklist is the change most tied to teams that stayed. Keep it, and make the owner part of setup rather than a suggestion.
`

/** Version 1's Markdown: Sophia's readout, as she published it from the room. */
export const DEMO_V1 = `# ${DEMO_TITLE}

Twelve of the fourteen teams in the onboarding pilot were still active after four weeks. The two that left did so in week three, both right after their admin changed.

${MEASURED}
${KEPT}
${LEFT}
${CONCLUSION}
## Recommendations

1. Ship the shorter checklist to every new team.
2. Ask for a named owner at signup.
3. Answer setup tickets inside one working day during a team's first month.
`

/** Version 2's: the second region's cohort added, and the recommendations revised with it. */
export const DEMO_V2 = `# ${DEMO_TITLE}

Twelve of the fourteen teams in the onboarding pilot were still active after four weeks. The two that left did so in week three, both right after their admin changed.

${MEASURED}
${KEPT}
${LEFT}
## The second region

The five teams in the second region set up in their own language with a translated checklist. All five stayed, and their days to a first shared report (2.2) matched the first region's [${String(DASHBOARD)}]. Two of their tickets asked for the checklist in a shared document they could hand on [${String(TICKETS)}].

${CONCLUSION}
## Recommendations

1. Ship the shorter checklist to every new team, translated for the second region.
2. Ask for a named owner at signup, and hand the role over when an admin changes.
3. Answer setup tickets inside one working day during a team's first month.
4. Keep the checklist in a document a new admin can be handed.
`

/** Each version's SHA-256 (the viewer shows nothing that does not match it). */
export const DEMO_SHA = {
  v1: '4403c3ff75eb4cc740ca424e410c49189304939071261a1896a18a361243fc6d',
  v2: '58e282107ddb707f3e7e9ff203e14763af73561e69639e93070909993a32970d',
}

/** The sections version 1 has, by heading (its title's section first). */
export const DEMO_HEADINGS = [
  DEMO_TITLE,
  'What we measured',
  'What kept teams',
  'Why two teams left',
  'Conclusion',
  'Recommendations',
] as const

/** Sophia's description of the report, as Knowledge lists it. */
export const DEMO_DESCRIPTION =
  'Why 12 of 14 pilot teams stayed and two left in week three: the shorter checklist, a named owner, an early first report.'

/** The report's file name. */
export const DEMO_FILE = 'pilot-readout'

/** The meeting before this one: what was decided, and what was still open. */
// The brief's own, as Conversations shows it (conversation-data.ts): accepted on Oct 4, and still open.
export const DEMO_DECIDED = 'Reports open on the answer'
export const DEMO_OPEN = 'Map first, list second'

/** The earlier meeting this project's room held. */
export const DEMO_MEETING = 'Pilot review'
