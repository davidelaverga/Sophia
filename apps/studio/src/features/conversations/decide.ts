// Decide here (docs/plans/conversations-decide.md, C7): the brief's own writes (A08) from a conversation, a proposal
// accepted or turned down in the context, a message proposed as a decision. After each, the brief is read again, here
// and wherever it shows (the room's brief, Updates).
import { useQueryClient } from '@tanstack/react-query'
import type { MissionDecision, MissionReceipt } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import { decideMissionChange, getMission, proposeMissionChange } from '../../api/mission.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { missionKey } from '../mission/mission-view.ts'
import { plainOf } from './sophia-text.ts'

/** The longest statement a message gives a proposal to start from: a sentence or two. */
const MOST = 200

/** What a message proposes, to edit before it goes: its words on one line, cut after a sentence within 200 characters. */
export function statementFrom(text: string, sophia: boolean): string {
  const line = (sophia ? plainOf(text) : text).replace(/\s+/gu, ' ').trim()
  if (line.length <= MOST) return line
  const cut = line.slice(0, MOST)
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '))
  return end > 40 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' ')).trimEnd()}…`
}

/** What a refused write says, by what it was: no longer allowed, decided first, or not to be done now. */
export function refusalWords(error: ApiError, write: 'decide' | 'propose'): string {
  if (error.code === BRIEF_UNREAD) return 'Couldn’t check the brief first, so nothing was sent. Try again.'
  if (error.status === 403) return write === 'decide' ? 'You can’t decide this here.' : 'You can’t propose here.'
  if (error.status === 409) {
    return write === 'decide'
      ? 'Someone decided it first. This is the brief as it is now.'
      : 'That proposal couldn’t be sent as written. Try again.'
  }
  return 'That couldn’t be done. Try again in a moment.'
}

/**
 * A refused decision's words (docs/plans/decide-on-its-way.md). Every 409 is a stale revision; the brief read again
 * tells them apart: a proposal still waiting wasn't decided by anyone, what it would replace changed. A brief that
 * couldn't be read again can't tell: its words are true either way.
 */
export function decideRefusal(error: ApiError, read: { fresh: boolean; stillWaiting: boolean }): string {
  if (error.status !== 409) return refusalWords(error, 'decide')
  if (!read.fresh) return 'It wasn’t decided here: the brief changed since.'
  return read.stillWaiting
    ? 'It can’t be decided as it is: the brief changed since. This is the brief as it is now.'
    : refusalWords(error, 'decide')
}

/**
 * Whether Accept and Decline wait: while a decision goes or its outcome is unknown, and once answered until the brief
 * read again no longer lists it (a read that is slow or fails would otherwise wake them on a decided proposal).
 */
export function pressesWait(state: DecideState, pending: readonly Pick<MissionDecision, 'id'>[]): boolean {
  if (state.status === 'sending' || state.status === 'unknown') return true
  return state.status === 'done' && pending.some((d) => d.id === state.args.decisionId)
}

/**
 * Whether a proposal is decided here: a constraint or a lesson, still current. A new direction (the mission itself) is
 * decided in the brief, where it shows what it replaces; a stale one can't be accepted as it is (A08).
 */
export const decidableHere = (d: MissionDecision): boolean => d.kind !== 'mission' && !d.stale

export interface DecideArgs {
  decisionId: string
  revision: number
  decision: 'accept' | 'reject'
}

/** Where Still open's decision stands: on its way, with no reply, answered, or refused in these words. */
export type DecideState =
  | { status: 'idle' }
  | { status: 'sending' | 'unknown' | 'done'; args: DecideArgs }
  | { status: 'rejected'; words: string }

/**
 * A proposal accepted or turned down, at the revision read; the brief read again whatever the answer. Answered or
 * refused as stale, it settles once that read is back, so what it says agrees with what shows (a refusal's words are
 * chosen from it); with no reply it doesn't wait for it, a write's 90 s being long enough.
 */
export function useDecideSend(projectId: string, identity: Identity) {
  const client = useQueryClient()
  const readAgain = () => client.invalidateQueries({ queryKey: missionKey(projectId) })
  return async (key: string, a: DecideArgs): Promise<MissionReceipt> => {
    try {
      const receipt = await decideMissionChange(identity.token, projectId, a.decisionId, key, {
        decision: a.decision,
        expectedRevision: a.revision,
      })
      await readAgain()
      return receipt
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) await readAgain()
      else void readAgain()
      throw err
    }
  }
}

/** The same words, whatever the spaces or the case. */
const sameWords = (a: string, b: string) =>
  a.trim().replace(/\s+/gu, ' ').toLowerCase() === b.trim().replace(/\s+/gu, ' ').toLowerCase()

/** Whether these words already wait for a decision as a constraint: proposing them again would add nothing. */
export const alreadyOpen = (pending: readonly Pick<MissionDecision, 'kind' | 'statement'>[], statement: string) =>
  pending.some((d) => d.kind === 'constraint' && sameWords(d.statement, statement))

/** A fresh proposal not sent because the brief couldn't be read first: a refusal, so the next press reads again. */
const BRIEF_UNREAD = 'brief_unread'

/**
 * Whether a fresh proposal's words already wait in the brief, read now: a proposal whose reply was lost, then the page
 * reloaded (its key gone with it), is found there rather than sent a second time. A read that fails sends nothing: it
 * is refused, to be pressed again, never taken for «not there».
 */
export function useAlreadyOpen(projectId: string, identity: Identity | null) {
  const client = useQueryClient()
  return async (statement: string): Promise<boolean> => {
    if (!identity) return false
    const brief = await client
      .fetchQuery({
        queryKey: [...missionKey(projectId), accountOf(identity), 'conversations'],
        queryFn: () => getMission(identity.token, projectId),
        staleTime: 0,
      })
      // Access lost is said as such; any other failure is the brief unread.
      .catch((err: unknown) => (err instanceof ApiError && err.status === 403 ? err : null))
    if (brief instanceof ApiError) throw brief
    if (brief === null) throw new ApiError(503, BRIEF_UNREAD, 'The brief could not be read', 'never')
    return alreadyOpen(brief.pending, statement)
  }
}

/**
 * A message's proposal sent under `key`: a constraint with these words (A08). Its receipt comes back once the brief has
 * been read again, so «it's in Still open» is never said before Still open can show it.
 */
export function useProposeSend(projectId: string, identity: Identity | null) {
  const client = useQueryClient()
  return async (key: string, statement: string): Promise<MissionReceipt> => {
    if (!identity) throw new Error('Nobody to propose as')
    const receipt = await proposeMissionChange(identity.token, projectId, key, { kind: 'constraint', statement })
    await client.invalidateQueries({ queryKey: missionKey(projectId) })
    return receipt
  }
}
