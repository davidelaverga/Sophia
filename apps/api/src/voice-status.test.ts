// project_status's operations for the guide (SMC-M03 S6, CX-0021): who may start research or ask for a PDF, and
// whether the project's research gate and a PDF renderer let them now. Pure: a synthetic mission context per speaker.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MissionContext } from '@sophia/contracts'
import type { ReportVersionText, ResearchVersions, TaskStanding } from '@sophia/persistence'
import { REVISABLE_CHARS, TOO_LONG_TO_REVISE } from './report-facts.ts'
import { voiceStatus, type VoiceStatusInput } from './voice-status.ts'

const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const SPEAKER = '00000000-0000-4000-8000-0000000000a1'
const AT = '2026-10-02T00:00:00.000Z'

const can = { available: true, reason: null }
const VIEWER = 'Viewers can talk with Sophia and read the mission; only editors and admins can change it.'

/** A present project with an accepted mission and nothing else, as an editor or a viewer reads it by voice. */
function missionContext(role: 'editor' | 'viewer'): MissionContext {
  const editor = role === 'editor'
  const allow = (reason: string) => (editor ? can : { available: false, reason })
  return {
    projectId: PROJECT,
    title: 'Synthetic project',
    readState: 'present',
    missionRevision: 1,
    ledgerRevision: 1,
    eligibilityRevision: 1,
    mission: {
      revision: 1,
      statement: 'Synthetic direction',
      purpose: null,
      destination: null,
      origin: null,
      decisionId: '00000000-0000-4000-8000-0000000000ad',
      acceptedBy: SPEAKER,
      acceptedAt: AT,
      sourceId: '00000000-0000-4000-8000-0000000000ac',
      sha256: '0'.repeat(64),
    },
    constraints: [],
    pending: [],
    decided: [],
    entries: [],
    history: [],
    excluded: { olderEntries: 0, olderHistory: 0, legacyFrame: false },
    missing: [],
    work: [],
    notePolicy: {
      capture: 'off',
      revision: 1,
      consent: 'unset',
      consentRevision: 1,
      acceptedMembers: 0,
      automaticNotes: false,
      explicitSelectedNoteSave: true,
      explicitProposals: true,
      exactTextRetention: false,
      transientBuffer: { turns: 0, bytes: 0, seconds: 0 },
    },
    capabilities: {
      recordNote: allow(VIEWER),
      propose: allow(VIEWER),
      decide: allow(VIEWER),
      correct: allow(VIEWER),
      withdrawOwnNote: can,
      setNotePolicy: allow('Only a project admin can change note capture.'),
      controlWork: allow('Only editors and admins can hold, resume or stop work.'),
    },
    compiler: 'sophia.mission-context.v1',
    digest: '0'.repeat(64),
  }
}

type Extra = Pick<VoiceStatusInput, 'guide' | 'pdf' | 'researchGate'>
const operations = (role: 'editor' | 'viewer', extra: Extra): Record<string, unknown> =>
  voiceStatus({
    context: missionContext(role),
    speakerId: SPEAKER,
    discussion: [],
    target: null,
    now: Date.parse(AT),
    ...extra,
  }).operations

const GATE_CLOSED = {
  available: false,
  reason: 'Research reports are not available: research is not switched on for this project.',
}

describe('project_status’s research operations', () => {
  it('closes start_research for an editor while the project’s research gate is closed, and only start_research', () => {
    const ops = operations('editor', { guide: 'v1.2', pdf: true, researchGate: false })
    assert.deepEqual(ops.start_research, GATE_CLOSED)
    // A rendition spends nothing from the grant (0032): the gate does not close Try PDF again.
    assert.deepEqual(ops.render_research, can)
    assert.deepEqual(ops.control_work, can)
  })

  it('offers start_research when the gate is open or unknown: an unread gate is left to the call', () => {
    for (const researchGate of [true, undefined]) {
      assert.deepEqual(operations('editor', { guide: 'v1.2', pdf: true, researchGate }).start_research, can)
    }
    const noRenderer = operations('editor', { guide: 'v1.2', pdf: false, researchGate: true })
    assert.deepEqual(noRenderer.render_research, {
      available: false,
      reason: 'PDF reports are not available: no PDF renderer is running.',
    })
    assert.deepEqual(noRenderer.start_research, can)
  })

  it('answers a viewer with the role first, in the research calls’ own words, whatever the gate or renderer', () => {
    for (const [pdf, researchGate] of [
      [false, false],
      [true, true],
      [undefined, undefined],
    ] as const) {
      const ops = operations('viewer', { guide: 'v1.2', pdf, researchGate })
      assert.deepEqual(ops.start_research, {
        available: false,
        reason: 'Only editors and admins can start research. Viewers can talk with Sophia.',
      })
      assert.deepEqual(ops.render_research, {
        available: false,
        reason: 'Only editors and admins can ask for the PDF.',
      })
    }
  })

  it('lists no research operations to a v1.1 guide, whatever it knows of the gate', () => {
    for (const guide of ['v1.1', undefined] as const) {
      const ops = operations('editor', { guide, pdf: false, researchGate: false })
      assert.deepEqual(Object.keys(ops), [
        'project_status',
        'read_selected_source',
        'record_mission_note',
        'propose_mission_change',
        'decide_mission_change',
        'control_work',
      ])
    }
  })
})

const GOAL = '00000000-0000-4000-8000-0000000000b0'
const ROOT = '00000000-0000-4000-8000-0000000000b1'
const FOLLOW = '00000000-0000-4000-8000-0000000000b2'
const BRIEF = '00000000-0000-4000-8000-0000000000b3'
const TITLE = 'Research: Which phone chargers are worth it?'

/** A first version: a title over seven sections, one of them a table. */
const V1_TEXT = `${[
  '# Phone chargers',
  ...['Summary', 'Standards', 'Speed', 'Claims', 'Prices', 'Advice'].map((h) => `## ${h}\n\nText.`),
  '## Table\n\n| a | b |\n| --- | --- |\n| 1 | 2 |',
].join('\n\n')}\n`

/** A published version with its text, as readResearchVersions reads it; its citation counts are what was stored. */
const version = (n: number, taskId: string, extra: Partial<ReportVersionText> = {}): ReportVersionText => ({
  id: `00000000-0000-4000-8000-0000000000c${String(n)}`,
  versionNumber: n,
  parentId: null,
  sourceId: `00000000-0000-4000-8000-0000000000d${String(n)}`,
  taskId,
  renditionOnly: false,
  pdf: false,
  cited: 5,
  citedVersions: 0,
  added: 5,
  dropped: 0,
  chars: V1_TEXT.length,
  text: V1_TEXT,
  ...extra,
})

const V1 = version(1, ROOT)

type Own = Pick<TaskStanding, 'state' | 'phase'>

/**
 * A finished root (version 1) and its follow-up sharing one goal (0025), the follow-up having published `v2` if given,
 * and a finished brief on a goal of its own; each with the versions read_selected_source would compare.
 */
function lineage(goalStatus: string, follow: Own, v2: ReportVersionText | null = null) {
  const rootPhase = goalStatus === 'held' ? 'held' : 'result_ready'
  const inFlight = ['pending', 'running'].includes(follow.state) ? [{ taskId: FOLLOW, ...follow }] : []
  const research = (taskId: string, own: Own, published: ReportVersionText | null): ResearchVersions => {
    const previous = published === v2 && v2 !== null ? V1 : null
    const current = v2 ?? V1
    const standing: TaskStanding = {
      taskId,
      kind: 'research',
      goalId: GOAL,
      goalStatus,
      ...own,
      published,
      previous,
      current,
      latestTaskId: FOLLOW,
      inFlight,
    }
    return { standing, own: published, previous, current, first: V1 }
  }
  const brief: ResearchVersions = {
    standing: {
      taskId: BRIEF,
      kind: 'draft_brief',
      goalId: BRIEF,
      goalStatus: 'completed',
      state: 'succeeded',
      phase: 'result_ready',
      published: null,
      previous: null,
      current: null,
      latestTaskId: null,
      inFlight: [],
    },
    own: null,
    previous: null,
    current: null,
    first: null,
  }
  const row = (taskId: string, phase: string) => ({ goalId: GOAL, title: TITLE, status: goalStatus, taskId, phase })
  return {
    work: [
      { ...row(ROOT, rootPhase), kind: 'research' as const },
      { ...row(FOLLOW, follow.phase), kind: 'research' as const },
      {
        goalId: BRIEF,
        title: 'Draft the brief.',
        status: 'completed',
        taskId: BRIEF,
        phase: 'result_ready',
        kind: 'draft_brief' as const,
      },
    ],
    tasks: [research(ROOT, { state: 'succeeded', phase: rootPhase }, V1), research(FOLLOW, follow, v2), brief],
  }
}

/** project_status for an editor, with this work and these tasks read. */
function statusOf(
  guide: VoiceStatusInput['guide'],
  { work, tasks }: { work: MissionContext['work']; tasks?: ResearchVersions[] },
) {
  return voiceStatus({
    context: { ...missionContext('editor'), work },
    speakerId: SPEAKER,
    discussion: [],
    target: null,
    now: Date.parse(AT),
    guide,
    tasks,
  })
}

/** What each row's report says of a follow-up; null for a row with no report or nothing to say. */
const followUps = (work: readonly object[]) =>
  work.map((w) => {
    const report: unknown = 'report' in w ? w.report : null
    return typeof report === 'object' && report !== null && 'followUp' in report ? report.followUp : null
  })

describe('project_status’s work: each task’s own state, Steer and its report, for v1.2 (CX-0026, CX-0027)', () => {
  it('reads a finished root as finished and its queued follow-up as waiting to start, whatever their shared goal says', () => {
    const { work } = statusOf('v1.2', lineage('ready', { state: 'pending', phase: 'queued' }))
    assert.deepEqual(work, [
      {
        goalId: GOAL,
        title: TITLE,
        status: 'ready',
        taskId: ROOT,
        phase: 'result_ready',
        kind: 'research',
        taskState: 'finished',
        steer: 'not_possible',
        report: {
          version: 1,
          latest: true,
          currentVersion: 1,
          changes: 'Version 1 is the first version. It cites 5 sources. This is the latest version.',
        },
      },
      {
        goalId: GOAL,
        title: TITLE,
        status: 'ready',
        taskId: FOLLOW,
        phase: 'queued',
        kind: 'research',
        taskState: 'waiting_to_start',
        steer: 'possible',
        report: {
          version: null,
          latest: false,
          currentVersion: 1,
          changes: `This task has published no version. The report is at version 1 (task ${ROOT}).`,
        },
      },
      {
        goalId: BRIEF,
        title: 'Draft the brief.',
        status: 'completed',
        taskId: BRIEF,
        phase: 'result_ready',
        kind: 'draft_brief',
        taskState: 'finished',
        steer: 'not_possible',
      },
    ])
  })

  it('never reads a finished task as held when its goal is, and says what a follow-up removed in counts', () => {
    const held = statusOf('v1.2', lineage('held', { state: 'running', phase: 'held' })).work
    assert.deepEqual(
      held.map((w) => [w.phase, 'taskState' in w ? w.taskState : null, 'steer' in w ? w.steer : null]),
      [
        ['held', 'finished', 'not_possible'],
        ['held', 'on_hold', 'not_possible'],
        ['result_ready', 'finished', 'not_possible'],
      ],
    )
    const v2 = version(2, FOLLOW, {
      parentId: V1.id,
      cited: 1,
      added: 1,
      dropped: 5,
      text: '# Phone chargers\n\n## Updated advice\n\nText.\n\n## Sources\n\nOne.\n',
    })
    const amended = statusOf('v1.2', lineage('completed', { state: 'succeeded', phase: 'result_ready' }, v2)).work
    const [root, follow] = amended.map((w) => ('report' in w ? w.report : null))
    assert.deepEqual(follow, {
      version: 2,
      latest: true,
      currentVersion: 2,
      changes:
        'Version 2 replaced version 1. Compared with version 1: 7 sections removed, 2 added, 0 revised, 1 unchanged; ' +
        'tables 1 → 0; 1 source cited (1 added, 5 dropped). This is the latest version.',
    })
    assert.deepEqual(root, {
      version: 1,
      latest: false,
      currentVersion: 2,
      changes: `Version 1 is the first version. It cites 5 sources. Replaced: the report is now at version 2 (task ${FOLLOW}).`,
    })
  })

  it('says on each row of a report too long for a follow-up that one cannot revise it yet (0037)', () => {
    const v2 = version(2, FOLLOW, { parentId: V1.id, chars: REVISABLE_CHARS + 1 })
    const long = statusOf('v1.2', lineage('completed', { state: 'succeeded', phase: 'result_ready' }, v2)).work
    assert.deepEqual(followUps(long), [TOO_LONG_TO_REVISE, TOO_LONG_TO_REVISE, null])
    const short = statusOf('v1.2', lineage('completed', { state: 'succeeded', phase: 'result_ready' })).work
    assert.deepEqual(followUps(short), [null, null, null], 'nothing said of a shorter one')
  })

  it('gives a v1.1 guide the work exactly as before, tasks read or not', () => {
    const shared = lineage('ready', { state: 'pending', phase: 'queued' })
    for (const guide of ['v1.1', undefined] as const) {
      const today = statusOf(guide, { work: shared.work })
      assert.deepEqual(statusOf(guide, shared), today)
      assert.deepEqual(today.work, shared.work)
    }
  })
})

describe('project_status for a v1.3 guide: the designed page and its edit (SDD-01)', () => {
  it('names a report’s current page and its sections, offers revise_html_page to editors, and keeps v1.2’s answer otherwise', () => {
    const shared = lineage('completed', { state: 'succeeded', phase: 'result_ready' })
    const page = {
      taskId: ROOT,
      versionId: '00000000-0000-4000-8000-0000000000c1',
      versionNumber: 2,
      reviewState: 'reviewed' as const,
      sections: ['summary', 'findings', 'sources'],
      designing: false,
    }
    const v13 = voiceStatus({
      context: { ...missionContext('editor'), work: shared.work },
      speakerId: SPEAKER,
      discussion: [],
      target: null,
      now: Date.parse(AT),
      guide: 'v1.3',
      tasks: shared.tasks,
      pages: [page],
    })
    const root = v13.work.find((w) => w.taskId === ROOT) as Record<string, unknown>
    assert.deepEqual(root.htmlPage, {
      versionNumber: 2,
      reviewState: 'reviewed',
      sections: ['summary', 'findings', 'sources'],
      revising: false,
    })
    assert.deepEqual((v13.operations as Record<string, unknown>).revise_html_page, can)
    // Everything else a v1.3 guide reads is v1.2's: its work rows without the page, and its operations.
    const v12 = statusOf('v1.2', shared)
    assert.deepEqual(
      v13.work.map((w) => {
        const { htmlPage: _page, ...rest } = w as Record<string, unknown>
        return rest
      }),
      v12.work,
    )
    const { revise_html_page: _revise, ...ops } = v13.operations as Record<string, unknown>
    assert.deepEqual(ops, v12.operations)
    assert.deepEqual(operations('viewer', { guide: 'v1.3', pdf: true, researchGate: true }).revise_html_page, {
      available: false,
      reason: 'Only editors and admins can ask for a page to be revised.',
    })
    assert.equal('revise_html_page' in operations('editor', { guide: 'v1.2', pdf: true, researchGate: true }), false)
  })
})
