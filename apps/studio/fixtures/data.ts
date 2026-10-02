// Labelled fixture data for the room's preservation checks (e2e/room.spec.ts): one project, this viewer's membership
// and the project's brief, typed against the contracts. Nothing here is live, and the fixture page says so on screen.
import type { DiscussionEntry, Membership, MissionContext, MissionNotePolicy, Snapshot } from '@sophia/contracts'
import type { Identity } from '../src/app/dev-identity.ts'

export const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const ME = '00000000-0000-4000-8000-0000000000a1'
const OTHER = '00000000-0000-4000-8000-0000000000a2'
const ROOM = '00000000-0000-4000-8000-0000000000ab'
const SOURCE = '00000000-0000-4000-8000-0000000000ac'
const EXCHANGE = '00000000-0000-4000-8000-0000000000ae'
const AT = '2026-10-02T00:00:00.000Z'

/** A dev identity: the fixture page never signs in, and no request carries this token anywhere. */
export const identity: Identity = { name: 'fixture@sophia.test', role: 'admin', token: 'fixture-no-api' }

export const membership: Membership = { actorId: ME, role: 'admin' }

/** A message another member wrote in the room's discussion, the `n`th. */
const said = (text: string, n: number): DiscussionEntry => ({
  id: `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`,
  actorId: OTHER,
  intent: 'discuss',
  origin: 'composer',
  text,
  sourceId: SOURCE,
  sha256: '0'.repeat(64),
  createdAt: AT,
})

/**
 * The project as a snapshot at `revision`: a later revision is a background update reaching the viewer. `exchange`:
 * a conversation with Sophia is open and this viewer holds the floor, so the chat's message bar is there. `messages`:
 * what other members wrote in the discussion, oldest first.
 */
export function snapshot(revision: number, exchange: boolean, messages: readonly string[] = []): Snapshot {
  return {
    projectId: PROJECT,
    title: 'Fixture project',
    cursor: String(revision),
    missionRevision: revision,
    audienceRevision: 1,
    eligibilityRevision: 1,
    goals: [],
    resources: [],
    humanActions: [],
    artifacts: [],
    sharedFocus: null,
    room: {
      id: ROOM,
      revision,
      inputActorId: exchange ? ME : null,
      mode: 'invoked',
      sophia: {
        exchangeId: exchange ? EXCHANGE : null,
        exchange: exchange ? 'open' : 'none',
        pauseReason: null,
        voice: exchange ? 'ready' : 'not_connected',
        inputActorId: exchange ? ME : null,
        inputEpoch: exchange ? 1 : null,
        playbackEpoch: null,
        observationEpoch: null,
        allowVision: false,
        looking: null,
        reason: null,
        reportedAt: null,
      },
    },
    lobby: [],
    sessions: [],
    discussion: messages.map(said),
    work: [],
  }
}

const policy: MissionNotePolicy = {
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
}

const can = { available: true, reason: null }

/** The brief at `revision`: what the panel reads; a newer one arrives with each background update. */
export function mission(revision: number): MissionContext {
  return {
    projectId: PROJECT,
    title: 'Fixture project',
    readState: 'present',
    missionRevision: revision,
    ledgerRevision: revision,
    eligibilityRevision: 1,
    mission: {
      revision,
      statement: `Fixture direction, revision ${revision}`,
      purpose: null,
      destination: null,
      origin: null,
      decisionId: '00000000-0000-4000-8000-0000000000ad',
      acceptedBy: ME,
      acceptedAt: AT,
      sourceId: SOURCE,
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
    notePolicy: policy,
    capabilities: {
      recordNote: can,
      propose: can,
      decide: can,
      correct: can,
      withdrawOwnNote: can,
      setNotePolicy: can,
      controlWork: can,
    },
    compiler: 'sophia.mission-context.v1',
    digest: '0'.repeat(64),
  }
}
