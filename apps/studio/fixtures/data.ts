// Labelled fixture data for the room's preservation checks (e2e/room.spec.ts): one project, its snapshot, events and
// brief, this viewer's membership and a room token, typed against the contracts. Nothing here is live, and the
// fixture page says so on screen.
import type {
  DiscussionEntry,
  Event,
  Membership,
  MissionContext,
  MissionEntry,
  MissionNotePolicy,
  RoomToken,
  Snapshot,
  SophiaPresence,
} from '@sophia/contracts'
import type { Identity } from '../src/app/dev-identity.ts'
import { DEMO, DEMO_STATEMENT, PROJECT_NAME } from './demo.ts'

export const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const ME = '00000000-0000-4000-8000-0000000000a1'
const OTHER = '00000000-0000-4000-8000-0000000000a2'
export const ROOM = '00000000-0000-4000-8000-0000000000ab'
const SOURCE = '00000000-0000-4000-8000-0000000000ac'
export const EXCHANGE = '00000000-0000-4000-8000-0000000000ae'
const AT = '2026-10-02T00:00:00.000Z'

/** A dev identity: the fixture page never signs in, and no request carries this token anywhere. */
export const identity: Identity = {
  name: DEMO ? 'luis@sophia.test' : 'fixture@sophia.test',
  role: 'admin',
  token: 'fixture-no-api',
}

export const membership: Membership = { actorId: ME, role: 'admin' }

/** A message another member wrote in the room's discussion, the `n`th. */
/** A message in the discussion: another member's, or `me` for the viewer's own (room-discussion checks). */
export interface Said {
  text: string
  me?: boolean
  /** Its entry id, kept as written (a message written on the page); absent, by its place in the discussion. */
  id?: string
  /** The entry it answers (A20's reply), by id, with who wrote that and its first words, recorded with the reply. */
  replyTo?: { id: string; actorId: string; excerpt: string }
}

/** The `n`th message's entry id in the discussion (0-based), as the snapshot lists it. */
export const entryIdOf = (n: number) => `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`

/** A message's entry id: the one it was written with, or its place in the discussion. */
export const idOf = (message: string | Said, n: number) =>
  typeof message !== 'string' && message.id ? message.id : entryIdOf(n)

/** Who wrote a message: the viewer's own, or another member's. */
export const authorOf = (message: string | Said) => (typeof message === 'string' || !message.me ? OTHER : ME)

const said = (message: string | Said, n: number): DiscussionEntry => ({
  id: idOf(message, n),
  actorId: authorOf(message),
  intent: 'discuss',
  origin: 'composer',
  text: typeof message === 'string' ? message : message.text,
  sourceId: SOURCE,
  sha256: '0'.repeat(64),
  createdAt: AT,
})

/** A holder who isn't in the room (`floor=absent`, and a pause because the holder left). */
export const ABSENT = '00000000-0000-4000-8000-0000000000b9'

/**
 * The room as the page asked for it (room-people checks): who holds the floor (an actor id; null, open; left out, the
 * viewer while Sophia's conversation is open, or someone gone when she paused because the holder left), how many
 * times it was passed (`inputEpoch`), and what her presence says of her voice, a pause and what she sees. A pause and
 * a voice belong to an open conversation only, as the API reads them.
 */
export interface RoomAsked {
  holder?: string | null | undefined
  inputEpoch?: number | undefined
  voice?: SophiaPresence['voice'] | undefined
  pauseReason?: SophiaPresence['pauseReason'] | undefined
  looking?: SophiaPresence['looking'] | undefined
  /** Sessions on the room's calendar (`session=soon`). */
  sessions?: Snapshot['sessions'] | undefined
}

/** Who holds the floor: asked for, else the viewer in Sophia's conversation (someone gone once she paused for it). */
function holderOf(exchange: boolean, room: RoomAsked): string | null {
  if (room.holder !== undefined) return room.holder
  if (!exchange) return null
  return room.pauseReason === 'holder_left' ? ABSENT : ME
}

const NO_CONVERSATION: SophiaPresence = {
  exchangeId: null,
  exchange: 'none',
  pauseReason: null,
  voice: 'not_connected',
  inputActorId: null,
  inputEpoch: null,
  playbackEpoch: null,
  observationEpoch: null,
  allowVision: false,
  looking: null,
  reason: null,
  reportedAt: null,
}

/** Sophia's presence in the snapshot: none outside a conversation; in one, its pause, voice and what she sees. */
function presenceOf(exchange: boolean, holder: string | null, room: RoomAsked): SophiaPresence {
  if (!exchange) return NO_CONVERSATION
  const looking = room.looking ?? null
  return {
    ...NO_CONVERSATION,
    exchangeId: EXCHANGE,
    exchange: room.pauseReason ? 'paused' : 'open',
    pauseReason: room.pauseReason ?? null,
    voice: room.voice ?? 'ready',
    inputActorId: holder,
    inputEpoch: room.inputEpoch ?? 1,
    observationEpoch: looking ? 1 : null,
    allowVision: !!looking,
    looking,
  }
}

/**
 * The project as a snapshot at `revision`: a later revision is a background update reaching the viewer. `exchange`:
 * a conversation with Sophia is open and this viewer holds the floor, so the chat's message bar is there. `messages`:
 * what other members wrote in the discussion, oldest first. `goals`: the project's goals (the work fixture's one).
 * `room`: the floor and Sophia's presence otherwise (RoomAsked).
 */
export function snapshot(
  revision: number,
  exchange: boolean,
  messages: readonly (string | Said)[] = [],
  goals: Snapshot['goals'] = [],
  room: RoomAsked = {},
): Snapshot {
  const holder = holderOf(exchange, room)
  return {
    projectId: PROJECT,
    title: PROJECT_NAME,
    cursor: String(revision),
    missionRevision: revision,
    audienceRevision: 1,
    eligibilityRevision: 1,
    goals,
    resources: [],
    humanActions: [],
    artifacts: [],
    sharedFocus: null,
    room: { id: ROOM, revision, inputActorId: holder, mode: 'invoked', sophia: presenceOf(exchange, holder, room) },
    lobby: [],
    sessions: room.sessions ?? [],
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

/**
 * The brief at `revision`: what the panel reads; a newer one arrives with each background update. `entries`: the
 * notes members wrote (brief-data.ts); `noted`: whether the brief allows this person a note.
 */
export function mission(revision: number, entries: readonly MissionEntry[] = [], noted = true): MissionContext {
  return {
    projectId: PROJECT,
    title: PROJECT_NAME,
    readState: 'present',
    missionRevision: revision,
    ledgerRevision: revision,
    eligibilityRevision: 1,
    mission: {
      revision,
      statement: DEMO ? DEMO_STATEMENT : `Fixture direction, revision ${revision}`,
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
    entries,
    history: [],
    excluded: { olderEntries: 0, olderHistory: 0, legacyFrame: false },
    missing: [],
    work: [],
    notePolicy: policy,
    capabilities: {
      recordNote: noted ? can : { available: false, reason: 'Notes are off for you here.' },
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

/** The event a background update sends: the project moved to `sequence`, so the page refetches its snapshot. */
export const projectEvent = (sequence: number): Event => ({
  eventId: `00000000-0000-4000-8000-1${String(sequence).padStart(11, '0')}`,
  projectId: PROJECT,
  sequence: String(sequence),
  type: 'project.updated',
  occurredAt: AT,
  entityType: 'project',
  entityId: PROJECT,
  entityRevision: sequence,
  references: [],
  summaryCode: 'fixture.update',
})

/** A room token for the fake LiveKit (fake-livekit.ts): no server is behind it. */
export const roomToken: RoomToken = {
  roomId: ROOM,
  serverUrl: 'wss://livekit.fixture.invalid',
  token: 'fixture-no-livekit',
  expiresAt: '2099-01-01T00:00:00.000Z',
}
