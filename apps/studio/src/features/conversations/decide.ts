// Decide here (docs/plans/conversations-decide.md, C7): the brief's own writes (A08) from a conversation, a proposal
// accepted or turned down in the context, a message proposed as a decision. After each, the brief is read again, here
// and wherever it shows (the room's brief, Updates).
import { useQueryClient } from '@tanstack/react-query'
import type { MissionDecision, MissionReceipt } from '@sophia/contracts'
import type { ApiError } from '../../api/client.ts'
import { decideMissionChange, proposeMissionChange } from '../../api/mission.ts'
import { useAdmission } from '../../api/useAdmission.ts'
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
  if (error.status === 403) return write === 'decide' ? 'You can’t decide this here.' : 'You can’t propose here.'
  if (error.status === 409) {
    return write === 'decide'
      ? 'Someone decided it first. This is the brief as it is now.'
      : 'That proposal couldn’t be sent as written. Try again.'
  }
  return 'That couldn’t be done. Try again in a moment.'
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

/** A proposal accepted or turned down, at the revision read; the brief read again whatever the answer. */
export function useDecide(projectId: string, identity: Identity) {
  const client = useQueryClient()
  return useAdmission<DecideArgs, MissionReceipt>(async (key, a) => {
    try {
      return await decideMissionChange(identity.token, projectId, a.decisionId, key, {
        decision: a.decision,
        expectedRevision: a.revision,
      })
    } finally {
      void client.invalidateQueries({ queryKey: missionKey(projectId) })
    }
  })
}

/**
 * A statement proposed as one of the project's constraints; the brief read again once it lands. No identity (someone
 * who can't write here): nothing is ever sent.
 */
export function usePropose(projectId: string, identity: Identity | null) {
  const client = useQueryClient()
  return useAdmission<string, MissionReceipt>(async (key, statement) => {
    if (!identity) throw new Error('Nobody to propose as')
    const receipt = await proposeMissionChange(identity.token, projectId, key, { kind: 'constraint', statement })
    void client.invalidateQueries({ queryKey: missionKey(projectId) })
    return receipt
  })
}
