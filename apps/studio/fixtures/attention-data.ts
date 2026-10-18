// What changed since you last looked as A34 serves it (docs/handoffs/FND-C-ATTENTION-BOUNDARY-attempt-1.md), for the
// app's fixture page under `attention=a34` (fixtures/app.tsx, e2e-attention/attention-page.spec.ts): strict windows of
// the contract's shape, each account's own, with nobody named and no moment kept where the service can't say them, and
// `more` while events lie after the window. Marking seen (PUT /seen) moves only the account's own mark, to a window's
// `toSequence`, never past the newest event. Luis is no member: his read is refused, as A34 refuses an outsider. Every
// id and word is synthetic.
import { PROJECT } from './data.ts'

export const MARCO = '00000000-0000-4000-8000-00000000a001'
/** The account A34 refuses (403): not a member of the project. */
export const OUTSIDER = '00000000-0000-4000-8000-00000000e001'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const NEWEST = '15'

const empty = { decided: [], made: [], noted: [], open: [], work: [] }

/** The window after `mark`: the first holds nulls and has more after it; the second is the rest; then nothing new. */
function windowAfter(mark: string | null) {
  if (mark === null) {
    return {
      ...empty,
      fromSequence: null,
      toSequence: '12',
      more: true,
      decided: [
        {
          decisionId: id(1),
          statement: 'Ship on Friday',
          proposedBy: null,
          decidedBy: null,
          at: null,
          undoable: false,
        },
        {
          decisionId: id(2),
          statement: 'Keep the retry',
          proposedBy: null,
          decidedBy: MARCO,
          at: '2026-10-16T09:00:00.000Z',
          undoable: false,
        },
      ],
      made: [{ artifactId: id(3), artifactVersionId: id(4), title: 'Launch notes', versionNumber: 2, askedBy: null }],
      names: { [MARCO]: 'Marco' },
    }
  }
  if (mark === '12') {
    return {
      ...empty,
      fromSequence: '12',
      toSequence: NEWEST,
      more: false,
      open: [{ proposalId: id(5), statement: 'Move the review to Monday?' }],
      names: {},
    }
  }
  return { ...empty, fromSequence: mark, toSequence: mark, more: false, names: {} }
}

const json = (status: number, body?: unknown) =>
  body === undefined
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const refusal = (status: number, code: string, message: string) =>
  json(status, { code, message, requestId: PROJECT, retry: 'never' })

const SEQUENCE = /^(0|[1-9][0-9]{0,18})$/

/** PUT /seen: the account's mark moves to the window's bound, only forward, never past the newest event. */
function seenPut(marks: Map<string, string | null>, by: string, body: unknown, record: (said: string) => void) {
  const sent: unknown = typeof body === 'string' ? Reflect.get(JSON.parse(body), 'sequence') : null
  if (typeof sent !== 'string' || !SEQUENCE.test(sent)) return refusal(422, 'invalid_request', 'Not a sequence')
  if (BigInt(sent) > BigInt(NEWEST)) return refusal(422, 'invalid_request', 'Past the newest event')
  record(`seen ${sent} by ${by}`)
  const before = marks.get(by) ?? null
  // Only forward: an older value (a retry after a lost reply) changes nothing.
  if (before === null || BigInt(sent) > BigInt(before)) marks.set(by, sent)
  return json(204)
}

/** A34's two routes for this project, answered for the account `by`; undefined for any other request. */
export function attentionAnswer(
  marks: Map<string, string | null>,
  record: (said: string) => void,
  request: { pathname: string; method: string; by: string; body: unknown },
): Response | undefined {
  const { pathname, method, by } = request
  const base = `/api/v1/projects/${PROJECT}`
  const route = `${method} ${pathname}`
  if (route !== `GET ${base}/since` && route !== `PUT ${base}/seen`) return undefined
  if (by === OUTSIDER) return refusal(403, 'forbidden', 'Not permitted')
  if (method === 'GET') {
    record(`since by ${by}`)
    return json(200, windowAfter(marks.get(by) ?? null))
  }
  return seenPut(marks, by, request.body, record)
}
