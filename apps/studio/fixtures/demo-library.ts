// The demo's library on Knowledge (`?demo=1`, docs/plans/knowledge-filters.md): the reports the onboarding pilot made
// beside its readout, each with its one version and its Markdown, and the survey's with a designed page of its own.
// Every number is invented, and the same in a report's Markdown and its page. Every hash is its text's.
import type { ArtifactVersion, ReportList, SourceContent } from '@sophia/contracts'
import { PROJECT } from './data.ts'
import { DEMO_PROJECT } from './demo.ts'
import { CSP, STYLE } from './demo-page.ts'

interface Text {
  sourceId: string
  sha256: string
  text: string
}

interface Shelved {
  artifactId: string
  versionId: string
  title: string
  summary: string
  updatedAt: string
  markdown: Text
  page?: Text
}

const SURVEY_BARS = [
  ['How to invite people', 14],
  ['Where the setup checklist is', 9],
  ['How to connect a source', 6],
  ['Who can see a report', 4],
] as const

/** The survey's designed page: three figures, what new admins asked first as bars, and what it means. */
function surveyPage(): string {
  const bars = SURVEY_BARS.map(
    ([label, n], i) =>
      `<text x="0" y="${String(30 + i * 40)}" font-size="13" fill="#1d1b22">${label}</text><rect x="230" y="${String(16 + i * 40)}" width="${String(n * 26)}" height="22" rx="5" fill="${i === 0 ? '#6d5bd0' : '#b4a6f0'}"/><text x="${String(238 + n * 26)}" y="${String(32 + i * 40)}" font-size="13" font-weight="600" fill="#1d1b22">${String(n)}</text>`,
  ).join('\n')
  return `${[
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Week-3 survey: what new admins asked first</title>',
    `<style>${STYLE}</style>`,
    '</head>',
    '<body>',
    `<main>
<div class="eyebrow">Onboarding pilot · Survey · week 3</div>
<h1>Week-3 survey: what new admins asked first</h1>
<p class="lede">Eleven of the fourteen teams answered. Their new admins asked how to invite people before anything else.</p>
<p class="meta">Researched by Sophia from the week-3 survey and the pilot’s tickets · Sep 15–21</p>
<section class="kpis">
<div class="kpi"><div class="n">11/14</div><div class="l">teams answered</div></div>
<div class="kpi"><div class="n">33</div><div class="l">first questions</div></div>
<div class="kpi"><div class="n">42%</div><div class="l">asked how to invite people</div></div>
<div class="kpi"><div class="n">2</div><div class="l">teams with a new admin</div></div>
</section>
<div class="figure"><h3>What new admins asked first</h3><p class="cap">Thirty-three first questions, from eleven teams.</p>
<svg viewBox="0 0 640 170" role="img" aria-label="How to invite people 14; where the setup checklist is 9; how to connect a source 6; who can see a report 4">
${bars}
</svg></div>
<h2>What it means</h2>
<p>A new admin starts by inviting people. The checklist should open on that step, and say who answers setup questions.</p>
</main>`,
    '</body>',
    '</html>',
  ].join('\n')}\n`
}

const md = (lines: string[]) => `${lines.join('\n\n')}\n`

/** The library beside the readout, newest first: all five on Knowledge's first page, after the readout. */
const SHELF: Shelved[] = [
  {
    artifactId: '00000000-0000-4000-8000-0000000001a1',
    versionId: '00000000-0000-4000-8000-0000000001a2',
    title: 'Week-3 survey: what new admins asked first',
    summary: 'Eleven of fourteen teams answered; new admins asked how to invite people before anything else.',
    updatedAt: '2026-09-29T10:00:00.000Z',
    markdown: {
      sourceId: '00000000-0000-4000-8000-0000000001a3',
      sha256: '6d07e188a32e6ff55bd9df3020b3170767ab78ba184faf054cf0b8b4a20f954f',
      text: md([
        '# Week-3 survey: what new admins asked first',
        'Eleven of the fourteen teams answered. Their new admins asked how to invite people before anything else.',
        '## What they asked',
        'How to invite people (14), where the setup checklist is (9), how to connect a source (6), who can see a report (4).',
      ]),
    },
    page: {
      sourceId: '00000000-0000-4000-8000-0000000001a4',
      sha256: 'ddf7f5d3336371a9dba66e6452b8345f801e02c58c460c4afdfd1f2100402380',
      text: surveyPage(),
    },
  },
  {
    artifactId: '00000000-0000-4000-8000-0000000001a5',
    versionId: '00000000-0000-4000-8000-0000000001a6',
    title: 'Setup checklist: five steps, one owner',
    summary: 'The shorter checklist the pilot teams used, with who answers setup questions in the first month.',
    updatedAt: '2026-09-26T10:00:00.000Z',
    markdown: {
      sourceId: '00000000-0000-4000-8000-0000000001a7',
      sha256: '0b05291888873bfe3e47cda1aaa4826c3855e085514f75f4001cfcb8d66ae463',
      text: md([
        '# Setup checklist: five steps, one owner',
        'Five steps for a team’s first session, and one person who answers setup questions inside a day.',
        '## The five steps',
        '- Invite the people who will read the reports.',
        '- Name the setup owner.',
        '- Connect one source the team trusts.',
      ]),
    },
  },
  {
    artifactId: '00000000-0000-4000-8000-0000000001a8',
    versionId: '00000000-0000-4000-8000-0000000001a9',
    title: 'Support tickets in the pilot: 41 tickets, three themes',
    summary: 'Every setup ticket the pilot raised, grouped by what it asked and how long its first answer took.',
    updatedAt: '2026-09-24T10:00:00.000Z',
    markdown: {
      sourceId: '00000000-0000-4000-8000-0000000001aa',
      sha256: '51aeb3759e99ece0a12e67d4651c29aded91d3c30e146ef4eedc627567debbb7',
      text: md([
        '# Support tickets in the pilot: 41 tickets, three themes',
        'Forty-one tickets in four weeks: inviting people, finding the checklist, and roles.',
        [
          '| Theme | Tickets | First answer |',
          '| --- | --- | --- |',
          '| Inviting people | 18 | 4 h |',
          '| Finding the checklist | 13 | 6 h |',
        ].join('\n'),
      ]),
    },
  },
  {
    artifactId: '00000000-0000-4000-8000-0000000001ae',
    versionId: '00000000-0000-4000-8000-0000000001af',
    title: 'Onboarding call notes: fourteen first sessions',
    summary: 'What each team did in its first session, and the questions its admin asked before the call ended.',
    updatedAt: '2026-09-22T10:00:00.000Z',
    markdown: {
      sourceId: '00000000-0000-4000-8000-0000000001b0',
      sha256: '8dd234cfc6d957629e257ca2af4c3869eb2da9b397d634078fa34ee39cf85f32',
      text: md([
        '# Onboarding call notes: fourteen first sessions',
        'Nine teams finished the five steps inside their first session; five finished them by the end of week one.',
        '## What admins asked',
        'Who answers setup questions after the call, and where the checklist lives once it is done.',
      ]),
    },
  },
  {
    artifactId: '00000000-0000-4000-8000-0000000001ab',
    versionId: '00000000-0000-4000-8000-0000000001ac',
    title: 'Second region: setting up in their own language',
    summary: 'How the five second-region teams set up with a translated checklist, and what they asked for.',
    updatedAt: '2026-09-20T10:00:00.000Z',
    markdown: {
      sourceId: '00000000-0000-4000-8000-0000000001ad',
      sha256: '9953f48c1a4152f11648e40b0fc58cf8fcb5fa568356e83247d2858df6835b28',
      text: md([
        '# Second region: setting up in their own language',
        'All five teams set up with the translated checklist, and all five were active after four weeks.',
        '## What they asked for',
        'A checklist in a document they could hand on to a new admin.',
      ]),
    },
  },
]

/** A shelved report's card, as `GET /knowledge/reports` answers it. */
function cardOf(s: Shelved): ReportList['reports'][number] {
  return {
    artifactId: s.artifactId,
    projectId: PROJECT,
    projectTitle: DEMO_PROJECT,
    title: s.title,
    summary: s.summary,
    summaryAuthorId: null,
    summaryRevision: 1,
    summaryUpdatedAt: null,
    currentVersionId: s.versionId,
    currentVersionNumber: 1,
    versionCount: 1,
    updatedAt: s.updatedAt,
    formats: s.page ? ['markdown', 'html'] : ['markdown'],
    latestChange: { note: null, retained: null },
  }
}

/** The library's cards, on Knowledge's first page after the readout: two full rows at 1440 px. */
export const LIBRARY = SHELF.map(cardOf)

/** A shelved report's one version, as `GET /artifacts/{id}/versions` answers it; null for any other report. */
export function libraryVersions(artifactId: string): ArtifactVersion[] | null {
  const s = SHELF.find((x) => x.artifactId === artifactId)
  if (!s) return null
  const page = s.page
  return [
    {
      id: s.versionId,
      artifactId: s.artifactId,
      projectId: PROJECT,
      parentId: null,
      sourceId: s.markdown.sourceId,
      sourceHash: s.markdown.sha256,
      state: 'stable',
      previewId: null,
      format: 'markdown',
      exportEditability: 'source_editable',
      title: s.title,
      versionNumber: 1,
      createdAt: s.updatedAt,
      renditions: page
        ? [
            {
              format: 'html',
              sourceId: page.sourceId,
              sha256: page.sha256,
              byteLength: new TextEncoder().encode(page.text).byteLength,
              mime: 'text/html',
              pageCount: null,
              reviewState: 'reviewed',
              limitations: [],
            },
          ]
        : [],
      limitations: [],
    },
  ]
}

/** A shelved report's Markdown or page, as `GET /sources/{id}/content` answers it; null for any other source. */
export function libraryContent(sourceId: string): SourceContent | null {
  for (const s of SHELF) {
    const text = [s.markdown, s.page].find((t) => t?.sourceId === sourceId)
    if (!text) continue
    const html = text === s.page
    return {
      sourceId,
      sha256: text.sha256,
      mime: html ? 'text/html' : 'text/markdown',
      byteLength: new TextEncoder().encode(text.text).byteLength,
      filename: `${s.artifactId.slice(-4)}.${html ? 'html' : 'md'}`,
      disposition: 'inline',
      text: text.text,
      downloadUrl: null,
      expiresAt: null,
    }
  }
  return null
}

/** Every shelved text, for the one-off script that checks each hash against its text. */
export const LIBRARY_TEXTS = SHELF.flatMap((s) => [s.markdown, ...(s.page ? [s.page] : [])])
