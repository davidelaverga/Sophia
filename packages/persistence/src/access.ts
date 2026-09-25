// Room access (db/migrations/0010 and 0011, contract amendments A02 and A03): invitations, the lobby and
// room sessions. Writes go through the sophia.* functions, which re-check authority; reads run under RLS.
// Tokens never reach this module, only their SHA-256: the API derives and hashes them.
import type pg from 'pg'
import type { InvitationPreview, LobbyDecision, LobbyEntry, Membership, RoomSession } from '@sophia/contracts'
import { DomainError } from '@sophia/domain'
import { onlyRow } from './rows.ts'

const iso = (value: Date | string) => new Date(value).toISOString()

export interface InvitationRecord {
  id: string
  projectId: string
  kind: 'guest' | 'member'
  role: 'editor' | 'viewer' | null
  email: string | null
  sessionId: string | null
  expiresAt: string
  maxUses: number
  uses: number
  revokedAt: string | null
  emailStatus: 'none' | 'sent' | 'failed' | 'not_configured'
  createdAt: string
  /** Which link is current: the API derives the link from the id and this version. */
  tokenVersion: number
  inviterName: string | null
}

interface InvitationRow {
  id: string
  project_id: string
  kind: InvitationRecord['kind']
  member_role: InvitationRecord['role']
  email: string | null
  session_id: string | null
  expires_at: Date
  max_uses: number
  uses: number
  revoked_at: Date | null
  email_status: InvitationRecord['emailStatus']
  created_at: Date
  token_version: number
  inviter_name: string | null
}

const INVITATION_COLUMNS = `id, project_id, kind, member_role, email, session_id, expires_at, max_uses, uses, revoked_at,
  email_status, created_at, token_version, inviter_name`

const toInvitation = (r: InvitationRow): InvitationRecord => ({
  id: r.id,
  projectId: r.project_id,
  kind: r.kind,
  role: r.member_role,
  email: r.email,
  sessionId: r.session_id,
  expiresAt: iso(r.expires_at),
  maxUses: r.max_uses,
  uses: r.uses,
  revokedAt: r.revoked_at ? iso(r.revoked_at) : null,
  emailStatus: r.email_status,
  createdAt: iso(r.created_at),
  tokenVersion: r.token_version,
  inviterName: r.inviter_name,
})

export interface InvitationRequest {
  kind: 'guest' | 'member'
  role: 'editor' | 'viewer' | null
  email: string | null
  sessionId: string | null
  expiresAt: string
  maxUses: number
  inviterName: string | null
}

export interface NewInvitation {
  projectId: string
  /** Chosen by the API, which derives the link from it. */
  id: string
  request: InvitationRequest
  tokenSha256: Buffer
  idempotencyKey: string
}

/**
 * Create an invitation through sophia.create_room_invitation; the same creator and key return the first
 * invitation's id (not `id`). Call inside withActor(..., "write").
 */
export async function createRoomInvitation(c: pg.PoolClient, n: NewInvitation): Promise<string> {
  const { rows } = await c.query<{ id: string }>(`SELECT sophia.create_room_invitation($1, $2, $3, $4, $5) AS id`, [
    n.projectId,
    n.id,
    JSON.stringify(n.request),
    n.tokenSha256,
    n.idempotencyKey,
  ])
  return onlyRow(rows, 'create_room_invitation').id
}

/** One invitation the actor can see (editors and admins of its project, by RLS), or null. */
export async function readInvitation(c: pg.PoolClient, invitationId: string): Promise<InvitationRecord | null> {
  const { rows } = await c.query<InvitationRow>(
    `SELECT ${INVITATION_COLUMNS} FROM sophia.room_invitations WHERE id = $1`,
    [invitationId],
  )
  return rows[0] ? toInvitation(rows[0]) : null
}

/** A project's invitations, newest first; empty for anyone who cannot invite (RLS). */
export async function listInvitations(c: pg.PoolClient, projectId: string): Promise<InvitationRecord[]> {
  const { rows } = await c.query<InvitationRow>(
    `SELECT ${INVITATION_COLUMNS} FROM sophia.room_invitations WHERE project_id = $1 ORDER BY created_at DESC, id
      LIMIT 500`,
    [projectId],
  )
  return rows.map(toInvitation)
}

/** A new link for the invitation (compare-and-set on its version). Returns the new version. */
export async function reissueRoomInvitation(
  c: pg.PoolClient,
  invitationId: string,
  expectedVersion: number,
  tokenSha256: Buffer,
): Promise<number> {
  const { rows } = await c.query<{ version: number }>(`SELECT sophia.reissue_room_invitation($1, $2, $3) AS version`, [
    invitationId,
    expectedVersion,
    tokenSha256,
  ])
  return onlyRow(rows, 'reissue_room_invitation').version
}

export async function revokeRoomInvitation(c: pg.PoolClient, invitationId: string): Promise<void> {
  await c.query(`SELECT sophia.revoke_room_invitation($1)`, [invitationId])
}

export async function recordInvitationEmail(
  c: pg.PoolClient,
  invitationId: string,
  version: number,
  status: 'sent' | 'failed' | 'not_configured',
): Promise<void> {
  await c.query(`SELECT sophia.record_invitation_email($1, $2, $3)`, [invitationId, version, status])
}

/** Where a link leads; no actor needed. An unknown token is not_found, so links cannot be probed for more. */
export async function previewRoomInvitation(c: pg.PoolClient, tokenSha256: Buffer): Promise<InvitationPreview> {
  const { rows } = await c.query<{ preview: InvitationPreview }>(
    `SELECT sophia.preview_room_invitation($1) AS preview`,
    [tokenSha256],
  )
  const p = onlyRow(rows, 'preview_room_invitation').preview
  return {
    ...p,
    expiresAt: iso(p.expiresAt),
    session: p.session ? { ...p.session, startsAt: iso(p.session.startsAt), endsAt: iso(p.session.endsAt) } : null,
  }
}

/** A lobby entry with what the API needs beyond the contract: who it is and which room. */
export interface LobbyRecord extends LobbyEntry {
  actorId: string
  roomId: string
  projectId: string
}

interface LobbyJson extends LobbyRecord {
  requestedAt: string
  decidedAt: string | null
}

const toLobby = (e: LobbyJson): LobbyRecord => ({
  ...e,
  requestedAt: iso(e.requestedAt),
  decidedAt: e.decidedAt ? iso(e.decidedAt) : null,
})

async function lobbyCall(c: pg.PoolClient, sql: string, params: unknown[], statement: string): Promise<LobbyRecord> {
  const { rows } = await c.query<{ entry: LobbyJson }>(sql, params)
  return toLobby(onlyRow(rows, statement).entry)
}

/** A guest knocks with the link's hash and the name to show. Call inside withActor(..., "write"). */
export const knockRoom = (c: pg.PoolClient, tokenSha256: Buffer, displayName: string) =>
  lobbyCall(c, `SELECT sophia.knock_room($1, $2) AS entry`, [tokenSha256, displayName], 'knock_room')

/** The guest's own entry; anyone else's is not_found. */
export const readLobbyEntry = (c: pg.PoolClient, entryId: string) =>
  lobbyCall(c, `SELECT sophia.read_lobby_entry($1) AS entry`, [entryId], 'read_lobby_entry')

/** Editors and admins let in, decline for now, block for good, or unblock (migration 0011). */
export const decideLobbyEntry = (c: pg.PoolClient, entryId: string, decision: LobbyDecision['decision']) =>
  lobbyCall(c, `SELECT sophia.decide_lobby_entry($1, $2) AS entry`, [entryId, decision], 'decide_lobby_entry')

/** An admitted guest's room and name, for their room token. */
export async function authorizeGuestJoin(
  c: pg.PoolClient,
  entryId: string,
): Promise<{ roomId: string; displayName: string }> {
  const { rows } = await c.query<{ access: { roomId: string; displayName: string } }>(
    `SELECT sophia.authorize_guest_join($1) AS access`,
    [entryId],
  )
  return onlyRow(rows, 'authorize_guest_join').access
}

/** The person a member invitation was sent to (their verified email) joins the project. */
export async function acceptRoomInvitation(
  c: pg.PoolClient,
  tokenSha256: Buffer,
  email: string | null,
): Promise<{ projectId: string }> {
  const { rows } = await c.query<{ accepted: { projectId: string } }>(
    `SELECT sophia.accept_room_invitation($1, $2) AS accepted`,
    [tokenSha256, email],
  )
  return onlyRow(rows, 'accept_room_invitation').accepted
}

interface SessionRow {
  id: string
  title: string
  starts_at: Date
  ends_at: Date
  time_zone: string
}

const toSession = (r: SessionRow): RoomSession => ({
  id: r.id,
  title: r.title,
  startsAt: iso(r.starts_at),
  endsAt: iso(r.ends_at),
  timeZone: r.time_zone,
})

async function readSession(c: pg.PoolClient, sessionId: string): Promise<RoomSession> {
  const { rows } = await c.query<SessionRow>(
    `SELECT id, title, starts_at, ends_at, time_zone FROM sophia.room_sessions WHERE id = $1`,
    [sessionId],
  )
  if (!rows[0]) throw new DomainError('not_found', 'Session not found')
  return toSession(rows[0])
}

export async function scheduleRoomSession(
  c: pg.PoolClient,
  projectId: string,
  req: { title: string; startsAt: string; endsAt: string; timeZone: string },
  idempotencyKey: string,
): Promise<RoomSession> {
  const { rows } = await c.query<{ id: string }>(`SELECT sophia.schedule_room_session($1, $2, $3, $4, $5, $6) AS id`, [
    projectId,
    req.title,
    req.startsAt,
    req.endsAt,
    req.timeZone,
    idempotencyKey,
  ])
  return readSession(c, onlyRow(rows, 'schedule_room_session').id)
}

export async function cancelRoomSession(c: pg.PoolClient, sessionId: string): Promise<RoomSession> {
  await c.query(`SELECT sophia.cancel_room_session($1)`, [sessionId])
  return readSession(c, sessionId)
}

/** Sessions still ahead (or under way), soonest first. Call inside withActor: RLS limits them to members. */
export async function readUpcomingSessions(c: pg.PoolClient, projectId: string): Promise<RoomSession[]> {
  const { rows } = await c.query<SessionRow>(
    `SELECT id, title, starts_at, ends_at, time_zone FROM sophia.room_sessions
      WHERE project_id = $1 AND canceled_at IS NULL AND ends_at > now() ORDER BY starts_at, id LIMIT 100`,
    [projectId],
  )
  return rows.map(toSession)
}

interface LobbyRow {
  id: string
  display_name: string
  status: LobbyEntry['status']
  requested_at: Date
  decided_at: Date | null
  knocks: number
}

/**
 * Who is waiting, let in or blocked, and who was declined in the last day (so a mistaken decline can still
 * be answered with Let in), oldest request first. Members only (RLS).
 */
export async function readLobby(c: pg.PoolClient, projectId: string): Promise<LobbyEntry[]> {
  const { rows } = await c.query<LobbyRow>(
    `SELECT id, display_name, status, requested_at, decided_at, knocks FROM sophia.room_lobby
      WHERE project_id = $1
        AND (status IN ('waiting', 'admitted', 'blocked') OR (status = 'denied' AND decided_at > now() - interval '1 day'))
      ORDER BY requested_at, id LIMIT 500`,
    [projectId],
  )
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    status: r.status,
    requestedAt: iso(r.requested_at),
    decidedAt: r.decided_at ? iso(r.decided_at) : null,
    knocks: r.knocks,
  }))
}

/** The caller's own role in the project, or null when they are not an active member. */
export async function readMembership(c: pg.PoolClient, projectId: string): Promise<Membership | null> {
  const { rows } = await c.query<{ actor_id: string; role: Membership['role'] }>(
    `SELECT actor_id, role FROM sophia.project_members WHERE project_id = $1 AND actor_id = sophia.actor_id() AND active`,
    [projectId],
  )
  return rows[0] ? { actorId: rows[0].actor_id, role: rows[0].role } : null
}
