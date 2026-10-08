// The brief's writes from a conversation (docs/plans/conversations-decide.md, C7), as A08 answers them: a proposal made
// (202, waiting, of the kind asked), and one decided at the revision read (accepted to the top of the decisions, or
// declined and gone). The same Idempotency-Key replays its receipt. `decide=stale`: someone else accepted the first one
// decided, just before (409): it has left what waits. Every word is synthetic.
import type { MissionDecision } from '@sophia/contracts'
import { membership, PROJECT } from './data.ts'

interface Brief {
  constraints: MissionDecision[]
  pending: MissionDecision[]
}

const PROPOSALS = `/api/v1/projects/${PROJECT}/mission/proposals`
const DECISION = new RegExp(`^${PROPOSALS}/([0-9a-f-]{36})/decision$`)
let made = 0
/** Each write's receipt by its key: the same key replays it. */
const receipts = new Map<string, Response>()
/** Every write that reached the brief, as `path` and its body: the checks read them (the page's fetch is faked, so no request leaves it). */
export const missionWrites: { path: string; body: unknown }[] = []
let staleOnce = new URLSearchParams(window.location.search).get('decide') === 'stale'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const bodyOf = (init: RequestInit | undefined): Record<string, unknown> => {
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  return typeof body === 'object' && body !== null ? Object.fromEntries(Object.entries(body)) : {}
}

const receipt = (operation: 'propose' | 'decide', d: MissionDecision, decision: 'accepted' | 'rejected' | null) => ({
  status: operation === 'propose' ? 'proposed' : 'committed',
  operation,
  projectId: PROJECT,
  entryId: null,
  decisionId: d.id,
  decisionRevision: d.revision,
  decision,
  sourceId: null,
  sha256: null,
  affected: [],
  ledgerRevision: 1,
  missionRevision: 1,
  eligibilityRevision: 1,
  cursor: '1',
})

function proposed(brief: Brief, init: RequestInit | undefined): Response | null {
  const body = bodyOf(init)
  const template = brief.pending[0] ?? brief.constraints[0]
  const kind = body.kind === 'mission' || body.kind === 'lesson' ? body.kind : 'constraint'
  if (typeof body.statement !== 'string' || !body.statement.trim() || !template) return null
  made += 1
  const d: MissionDecision = {
    ...template,
    id: `00000000-0000-4000-8000-0000000002${String(made).padStart(2, '0')}`,
    revision: 1,
    kind,
    state: 'proposed',
    statement: body.statement.trim(),
    proposedBy: membership.actorId,
    createdAt: new Date().toISOString(),
    decidedBy: null,
    decidedAt: null,
    decidedVia: null,
  }
  brief.pending.push(d)
  return json(receipt('propose', d, null), 202)
}

function decided(brief: Brief, id: string, init: RequestInit | undefined): Response | null {
  const body = bodyOf(init)
  const at = brief.pending.findIndex((d) => d.id === id)
  const d = brief.pending[at]
  if (!d || (body.decision !== 'accept' && body.decision !== 'reject')) return null
  if (staleOnce || body.expectedRevision !== d.revision) {
    staleOnce = false
    // Someone else decided it first: it leaves what waits, accepted by them.
    brief.pending.splice(at, 1)
    const theirs = '00000000-0000-4000-8000-0000000000a9'
    brief.constraints.unshift({
      ...d,
      revision: d.revision + 1,
      state: 'accepted',
      decidedBy: theirs,
      decidedAt: new Date().toISOString(),
      decidedVia: 'studio',
    })
    return json({ code: 'stale_revision', message: 'Decided first', requestId: 'fixture', retry: 'never' }, 409)
  }
  brief.pending.splice(at, 1)
  if (body.decision === 'reject') return json(receipt('decide', d, 'rejected'))
  const accepted: MissionDecision = {
    ...d,
    revision: d.revision + 1,
    state: 'accepted',
    decidedBy: membership.actorId,
    decidedAt: new Date().toISOString(),
    decidedVia: 'studio',
  }
  brief.constraints.unshift(accepted)
  return json(receipt('decide', accepted, 'accepted'))
}

/** A08's proposal and decision writes on the brief the conversations show; null for anything else. */
export function missionWritten(brief: Brief, method: string, path: string, init: RequestInit | undefined) {
  if (method !== 'POST') return null
  const id = DECISION.exec(path)?.[1]
  if (path !== PROPOSALS && !id) return null
  missionWrites.push({ path, body: bodyOf(init) })
  const key = new Headers(init?.headers).get('idempotency-key') ?? ''
  const replay = receipts.get(key)
  if (replay) return replay.clone()
  const answer = id ? decided(brief, id, init) : proposed(brief, init)
  if (answer && key) receipts.set(key, answer.clone())
  return answer
}
