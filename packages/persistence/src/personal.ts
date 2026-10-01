// The personal space (db/migrations/0021, contract amendment A10). Reads run under the calling person and see only
// their own rows (owner-only RLS); writes are sophia.* functions that re-check the owner, are idempotent per owner and
// key, and answer with a receipt of ids, never text. Nothing here reads another person's space or a project's records,
// except the membership and titles a carried note needs.
import type pg from 'pg'
import type {
  PersonalExport,
  PersonalNote,
  PersonalReceipt,
  PersonalRelease,
  PersonalSpace,
  PersonalTurn,
  PersonalTurnPage,
} from '@sophia/contracts'
import { onlyRow } from './rows.ts'

/** The latest turns a space read returns; earlier ones are said to exist (`earlier`). */
export const PERSONAL_TURN_LIMIT = 500
/** Turns a waiting client receives per poll. */
export const PERSONAL_PAGE_LIMIT = 100

interface TurnRow {
  id: string
  seq: string
  author: 'person' | 'sophia'
  body: string
  created_at: Date
  reply_to: string | null
  reply: 'pending' | 'answered' | 'failed' | null
  suggestion_id: string | null
  suggestion_body: string | null
  suggestion_state: 'open' | 'kept' | null
}

// A reply reads as it stands: one whose wait outlasted any answer reads as failed (0021, personal_reply_state).
const TURNS = `SELECT t.id, t.seq, t.author, t.body, t.created_at, t.reply_to,
    sophia.personal_reply_state(t.reply, t.asked_at) AS reply,
    sg.id AS suggestion_id, sg.body AS suggestion_body, sg.state AS suggestion_state
  FROM sophia.personal_turns t
  LEFT JOIN sophia.personal_suggestions sg ON sg.owner_id = t.owner_id AND sg.turn_id = t.id
  WHERE t.owner_id = sophia.actor_id()`

function turnOf(r: TurnRow): PersonalTurn {
  return {
    id: r.id,
    seq: Number(r.seq),
    author: r.author,
    text: r.body,
    createdAt: r.created_at.toISOString(),
    replyTo: r.reply_to,
    reply: r.reply,
    suggestion:
      r.suggestion_id && r.suggestion_body && r.suggestion_state
        ? { id: r.suggestion_id, text: r.suggestion_body, state: r.suggestion_state }
        : null,
  }
}

async function readRevision(c: pg.PoolClient): Promise<number> {
  const { rows } = await c.query<{ revision: string }>(
    `SELECT revision FROM sophia.personal_spaces WHERE owner_id = sophia.actor_id()`,
  )
  return rows[0] ? Number(rows[0].revision) : 1
}

/**
 * How many notes and carried notes a read lists (A10's maxItems). The writes keep a space within them (0021: 2000 notes,
 * 2000 carried per person), so these only stand guard: the newest are listed, in their order.
 */
export const PERSONAL_NOTE_LIMIT = 2000
export const PERSONAL_RELEASE_LIMIT = 2000

async function readNotes(c: pg.PoolClient): Promise<PersonalNote[]> {
  const { rows } = await c.query<{
    id: string
    body: string
    kept_by: 'person' | 'sophia'
    from_turn: string | null
    created_at: Date
  }>(
    `SELECT * FROM (SELECT id, body, kept_by, from_turn, created_at FROM sophia.personal_notes
      WHERE owner_id = sophia.actor_id() AND state = 'kept' ORDER BY created_at DESC, id DESC LIMIT $1) newest
      ORDER BY created_at, id`,
    [PERSONAL_NOTE_LIMIT],
  )
  return rows.map((r) => ({
    id: r.id,
    text: r.body,
    keptBy: r.kept_by,
    fromTurnId: r.from_turn,
    createdAt: r.created_at.toISOString(),
  }))
}

/** The person's carried notes; a project they can no longer read shows no title. */
async function readReleases(c: pg.PoolClient): Promise<PersonalRelease[]> {
  const { rows } = await c.query<{
    id: string
    note_id: string | null
    project_id: string
    title: string | null
    body: string
    created_at: Date
  }>(
    `SELECT * FROM (SELECT r.id, r.note_id, r.project_id, p.title, r.body, r.created_at
       FROM sophia.personal_releases r LEFT JOIN sophia.projects p ON p.id = r.project_id
      WHERE r.owner_id = sophia.actor_id() ORDER BY r.created_at DESC, r.id DESC LIMIT $1) newest
      ORDER BY created_at, id`,
    [PERSONAL_RELEASE_LIMIT],
  )
  return rows.map((r) => ({
    id: r.id,
    noteId: r.note_id,
    projectId: r.project_id,
    projectTitle: r.title,
    text: r.body,
    createdAt: r.created_at.toISOString(),
  }))
}

/**
 * The calling person's space, without the companion's state (the API adds it): the latest turns in order, whether
 * earlier ones exist, the kept notes and the carried ones. Call inside withActor(..., "read").
 */
export async function readPersonalSpace(
  c: pg.PoolClient,
  limit = PERSONAL_TURN_LIMIT,
): Promise<Omit<PersonalSpace, 'companion'>> {
  const { rows } = await c.query<TurnRow>(`${TURNS} ORDER BY t.seq DESC LIMIT $1`, [limit + 1])
  return {
    revision: await readRevision(c),
    turns: rows.slice(0, limit).map(turnOf).toReversed(),
    earlier: rows.length > limit,
    notes: await readNotes(c),
    releases: await readReleases(c),
  }
}

/** Turns after `after`, and whether any reply is still pending: what a waiting client polls. */
export async function readPersonalTurnsAfter(c: pg.PoolClient, after: number): Promise<PersonalTurnPage> {
  const { rows } = await c.query<TurnRow>(`${TURNS} AND t.seq > $1 ORDER BY t.seq LIMIT $2`, [
    after,
    PERSONAL_PAGE_LIMIT,
  ])
  const pending = await c.query<{ pending: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM sophia.personal_turns WHERE owner_id = sophia.actor_id() AND reply = 'pending'
       AND sophia.personal_reply_state(reply, asked_at) = 'pending') AS pending`,
  )
  return { revision: await readRevision(c), turns: rows.map(turnOf), pending: onlyRow(pending.rows, 'pending').pending }
}

/** Everything kept for the calling person: every turn, the notes, the carried notes. */
export async function readPersonalExport(c: pg.PoolClient): Promise<Omit<PersonalExport, 'exportedAt'>> {
  const { rows } = await c.query<TurnRow>(`${TURNS} ORDER BY t.seq`)
  return { turns: rows.map(turnOf), notes: await readNotes(c), releases: await readReleases(c) }
}

/** What the companion answers from: the pending turn, the conversation up to it, and the notes the person keeps. */
export interface CompanionContext {
  asked: PersonalTurn
  history: Array<{ author: 'person' | 'sophia'; text: string }>
  notes: string[]
}

/** The context for answering `turnId`, or null when that turn is not the caller's or no longer waits. */
export async function readCompanionContext(
  c: pg.PoolClient,
  turnId: string,
  depth = 20,
): Promise<CompanionContext | null> {
  const asked = (await c.query<TurnRow>(`${TURNS} AND t.id = $1`, [turnId])).rows[0]
  if (!asked || asked.author !== 'person' || asked.reply !== 'pending') return null
  const { rows } = await c.query<TurnRow>(`${TURNS} AND t.seq <= $1 ORDER BY t.seq DESC LIMIT $2`, [asked.seq, depth])
  const notes = await readNotes(c)
  return {
    asked: turnOf(asked),
    history: rows.toReversed().map((r) => ({ author: r.author, text: r.body })),
    notes: notes.map((n) => n.text),
  }
}

/** A welcome is due: the last turn is more than an hour old and is not already one. */
const WELCOME_DUE = `SELECT (t.created_at < now() - interval '1 hour' AND NOT (t.author = 'sophia' AND t.reply_to IS NULL)) AS due
  FROM sophia.personal_turns t WHERE t.owner_id = sophia.actor_id() ORDER BY t.seq DESC LIMIT 1`

/** What Sophia's welcome back is written from, or null when none is due (so no companion is asked for one). */
export async function readWelcomeContext(
  c: pg.PoolClient,
  depth = 20,
): Promise<Omit<CompanionContext, 'asked'> | null> {
  const due = (await c.query<{ due: boolean }>(WELCOME_DUE)).rows[0]?.due ?? false
  if (!due) return null
  const { rows } = await c.query<TurnRow>(`${TURNS} ORDER BY t.seq DESC LIMIT $1`, [depth])
  const notes = await readNotes(c)
  return {
    history: rows.toReversed().map((r) => ({ author: r.author, text: r.body })),
    notes: notes.map((n) => n.text),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Writes. Each is one sophia.* function; call inside withActor(..., "write").

async function receipt(c: pg.PoolClient, statement: string, sql: string, params: unknown[]): Promise<PersonalReceipt> {
  const { rows } = await c.query<{ receipt: PersonalReceipt }>(sql, params)
  return onlyRow(rows, statement).receipt
}

export const sendPersonalTurn = (c: pg.PoolClient, key: string, text: string) =>
  receipt(c, 'send_personal_turn', 'SELECT sophia.send_personal_turn($1, $2) AS receipt', [key, text])

export const retryPersonalTurn = (c: pg.PoolClient, key: string, turnId: string) =>
  receipt(c, 'retry_personal_turn', 'SELECT sophia.retry_personal_turn($1, $2) AS receipt', [key, turnId])

export const decidePersonalSuggestion = (
  c: pg.PoolClient,
  key: string,
  suggestionId: string,
  decision: 'keep' | 'dismiss',
) =>
  receipt(c, 'decide_personal_suggestion', 'SELECT sophia.decide_personal_suggestion($1, $2, $3) AS receipt', [
    key,
    suggestionId,
    decision,
  ])

export const keepPersonalNote = (
  c: pg.PoolClient,
  key: string,
  note: { text: string; fromTurnId?: string; suggestionId?: string },
) =>
  receipt(c, 'keep_personal_note', 'SELECT sophia.keep_personal_note($1, $2, $3, $4) AS receipt', [
    key,
    note.text,
    note.fromTurnId ?? null,
    note.suggestionId ?? null,
  ])

export const forgetPersonalNote = (c: pg.PoolClient, key: string, noteId: string) =>
  receipt(c, 'forget_personal_note', 'SELECT sophia.forget_personal_note($1, $2) AS receipt', [key, noteId])

/** `shownName` is how the note is attributed in the project: the name the person shows, never an id. */
export const carryPersonalNote = (
  c: pg.PoolClient,
  key: string,
  noteId: string,
  projectId: string,
  shownName: string | null,
) =>
  receipt(c, 'carry_personal_note', 'SELECT sophia.carry_personal_note($1, $2, $3, $4) AS receipt', [
    key,
    noteId,
    projectId,
    shownName,
  ])

export const takeBackPersonalRelease = (c: pg.PoolClient, key: string, releaseId: string) =>
  receipt(c, 'take_back_personal_release', 'SELECT sophia.take_back_personal_release($1, $2) AS receipt', [
    key,
    releaseId,
  ])

export const erasePersonalSpace = (c: pg.PoolClient, key: string, confirm: string) =>
  receipt(c, 'erase_personal_space', 'SELECT sophia.erase_personal_space($1, $2) AS receipt', [key, confirm])

/** The companion's reply to a pending turn, and at most one note it suggests. A turn already answered keeps its reply. */
export async function recordPersonalReply(
  c: pg.PoolClient,
  turnId: string,
  text: string,
  suggestion: string | null,
): Promise<void> {
  await c.query('SELECT sophia.record_personal_reply($1, $2, $3)', [turnId, text, suggestion])
}

/** Whether this process may answer the pending turn: false while another process is answering it (0021). */
export async function claimPersonalReply(c: pg.PoolClient, turnId: string): Promise<boolean> {
  const { rows } = await c.query<{ claimed: boolean }>('SELECT sophia.claim_personal_reply($1) AS claimed', [turnId])
  return onlyRow(rows, 'claim_personal_reply').claimed
}

/**
 * A welcome back asked for under `key`: its receipt when the key has one, or nothing is due, or another request is
 * getting it; 'claimed' when this request may ask the companion (then recordPersonalGreeting under the same key).
 */
export async function beginPersonalGreeting(c: pg.PoolClient, key: string): Promise<PersonalReceipt | 'claimed'> {
  const { rows } = await c.query<{ receipt: PersonalReceipt | { claimed: true } }>(
    'SELECT sophia.begin_personal_greeting($1) AS receipt',
    [key],
  )
  const answer = onlyRow(rows, 'begin_personal_greeting').receipt
  return 'claimed' in answer ? 'claimed' : answer
}

/** Sophia's welcome back under `key`; written only by the request holding the claim, while one is still due. */
export const recordPersonalGreeting = (c: pg.PoolClient, key: string, text: string) =>
  receipt(c, 'record_personal_greeting', 'SELECT sophia.record_personal_greeting($1, $2) AS receipt', [key, text])

/** The companion could not answer: the turn says so, and the person may ask again. */
export async function failPersonalReply(c: pg.PoolClient, turnId: string): Promise<void> {
  await c.query('SELECT sophia.fail_personal_reply($1)', [turnId])
}
