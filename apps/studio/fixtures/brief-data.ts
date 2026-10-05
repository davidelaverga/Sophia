// The brief's notes as the fixture API keeps them (room-passage checks): a note a member writes, its withdrawal's
// preview, and its withdrawal, answered as the API answers them. Every note is synthetic.
import type {
  MissionEntry,
  MissionEntryRequest,
  MissionReceipt,
  MissionWithdrawalPreview,
  MissionWithdrawalRequest,
} from '@sophia/contracts'
import { membership, PROJECT } from './data.ts'

/** The notes members wrote here, and whether something was built on them (`window.fixture.buildOnNotes`). */
export interface Notes {
  kept: MissionEntry[]
  /** How many notes were ever written: each one's id is new, as the API's are. */
  written: number
  /** Each note's receipt by its Idempotency-Key: the same key again replays it, as the API does. */
  receipts: Map<string, MissionReceipt>
  /** The next note lands, but its reply is lost on the way (`window.fixture.loseNextReply`). */
  loseReply: boolean
  /** A decision cites every note: withdrawing one would take it too. */
  builtOn: boolean
  /** The brief allows this person no note (`notes=off`). */
  refused: boolean
  /** The brief can't be read (`notes=unread`): its reads fail as an API without its database fails them. */
  unread?: boolean
}

const AT = '2026-10-05T12:00:00.000Z'
const BUILT = { id: '00000000-0000-4000-8000-0000000000af', revision: 1 }

const isEntryRequest = (value: unknown): value is MissionEntryRequest =>
  typeof value === 'object' && value !== null && 'text' in value && typeof value.text === 'string'

function receipt(operation: MissionReceipt['operation'], entryId: string, revision: number): MissionReceipt {
  return {
    status: 'committed',
    operation,
    projectId: PROJECT,
    entryId,
    decisionId: null,
    decisionRevision: null,
    decision: null,
    sourceId: null,
    sha256: null,
    affected: [entryId],
    ledgerRevision: revision,
    missionRevision: revision,
    eligibilityRevision: 1,
    cursor: String(revision),
  }
}

/** A member's note, kept as the API keeps it, once per key; null for a body that is not one. */
export function noteKept(notes: Notes, body: unknown, revision: number, key: string): MissionReceipt | null {
  const replayed = notes.receipts.get(key)
  if (replayed) return replayed
  const request: unknown = typeof body === 'string' ? JSON.parse(body) : null
  if (!isEntryRequest(request)) return null
  notes.written += 1
  const id = `00000000-0000-4000-8000-${String(notes.written).padStart(12, '0')}`
  notes.kept.push({
    id,
    kind: request.kind,
    epistemic: request.epistemic,
    state: 'current',
    text: request.text,
    textKind: 'member_text',
    authoredBy: 'member',
    actorId: membership.actorId,
    origin: 'studio',
    exchangeId: null,
    inputEpoch: null,
    relatedEntryId: null,
    supersedesEntryId: null,
    supersededById: null,
    goalId: null,
    decisionId: null,
    sourceId: '00000000-0000-4000-8000-0000000000ae',
    sha256: null,
    ledgerRevision: revision,
    observedAt: AT,
    recordedAt: AT,
    changedAt: null,
  })
  const kept = receipt('record_note', id, revision)
  notes.receipts.set(key, kept)
  return kept
}

/** What withdrawing the note would erase: itself, and the decision built on it when there is one. */
export function withdrawalPreview(notes: Notes, entryId: string): MissionWithdrawalPreview | null {
  const note = notes.kept.find((entry) => entry.id === entryId)
  if (!note) return null
  return {
    entryId,
    ledgerRevision: note.ledgerRevision,
    previewToken: `v1.1.${'a'.repeat(64)}`,
    expiresAt: '2099-01-01T00:00:00.000Z',
    entries: [{ id: entryId, state: 'current', text: note.text ?? '' }],
    decisions: notes.builtOn
      ? [
          {
            ...BUILT,
            kind: 'constraint',
            state: 'proposed',
            statement: 'A synthetic constraint built on the note.',
            purpose: null,
            destination: null,
            origin: null,
          },
        ]
      : [],
  }
}

const isWithdrawal = (value: unknown): value is MissionWithdrawalRequest =>
  typeof value === 'object' && value !== null && 'previewToken' in value && 'expectedAffected' in value

/** The note withdrawn: it leaves the brief's notes; null when the body or the note is not one. */
export function noteWithdrawn(notes: Notes, entryId: string, body: unknown, revision: number): MissionReceipt | null {
  const request: unknown = typeof body === 'string' ? JSON.parse(body) : null
  const at = notes.kept.findIndex((entry) => entry.id === entryId)
  if (!isWithdrawal(request) || at < 0) return null
  notes.kept.splice(at, 1)
  return receipt('withdraw_note', entryId, revision)
}
