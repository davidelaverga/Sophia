// Decide here (docs/plans/conversations-decide.md, C7): the brief's own writes (A08) from a conversation, a proposal
// accepted or turned down in the context, a message proposed as a decision. After each, the brief is read again, here
// and wherever it shows (the room's brief, Updates).
import { useQueryClient } from '@tanstack/react-query'
import type { MissionReceipt } from '@sophia/contracts'
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

/** What a refused decision says: someone decided first (a stale revision), or it couldn't be done. */
export const refusalWords = (error: ApiError): string =>
  error.status === 409
    ? 'Someone decided it first. This is the brief as it is now.'
    : 'That couldn’t be done. Try again in a moment.'

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

/** A statement proposed as one of the project's constraints; the brief read again once it lands. */
export function usePropose(projectId: string, identity: Identity) {
  const client = useQueryClient()
  return useAdmission<string, MissionReceipt>(async (key, statement) => {
    const receipt = await proposeMissionChange(identity.token, projectId, key, { kind: 'constraint', statement })
    void client.invalidateQueries({ queryKey: missionKey(projectId) })
    return receipt
  })
}
