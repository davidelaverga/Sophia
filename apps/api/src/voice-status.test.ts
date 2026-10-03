// project_status's operations for the guide (SMC-M03 S6, CX-0021): who may start research or ask for a PDF, and
// whether the project's research gate and a PDF renderer let them now. Pure: a synthetic mission context per speaker.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MissionContext } from '@sophia/contracts'
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
