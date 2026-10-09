// A decision from Still open held by the view (docs/plans/held-decision.md): on its way, or sent with no reply, its key,
// its intent and its words are kept per project and account (talk-store.ts), as a message's proposal is, so a trip to
// another view and back finds the same decision, and «Try again» sends it under its key, never a second.
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { MissionContext, MissionReceipt } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { missionKey } from '../mission/mission-view.ts'
import { decideRefusal, refusalWords, useDecideSend, type DecideArgs, type DecideState } from './decide.ts'
import { useHeldWrite } from './held-write.ts'
import { useKept } from './talk-store.ts'

/** A decision asked: what it decides, and the words of the proposal it decides. */
export interface DecisionAsk {
  args: DecideArgs
  statement: string
}

/** What the brief as last read says of a proposal: whether that read came back, and whether it still waits there. */
function useBriefRead(projectId: string, identity: Identity) {
  const client = useQueryClient()
  return (id: string) => {
    const read = client.getQueryState<MissionContext>([...missionKey(projectId), accountOf(identity), 'conversations'])
    return { fresh: read?.status !== 'error', stillWaiting: read?.data?.pending.some((d) => d.id === id) === true }
  }
}

/** The one decision Still open asks at a time, held by the view; what it said once answered, by the pane that saw it. */
export function useHeldDecision(projectId: string, identity: Identity) {
  const { kept, change } = useKept(projectId, accountOf(identity))
  const send = useDecideSend(projectId, identity)
  const briefOf = useBriefRead(projectId, identity)
  /** A refusal's words, chosen as it comes from the brief read again (the send waits for that read on a refusal). */
  const refusal = useRef<string | null>(null)
  const [done, setDone] = useState<DecisionAsk | null>(null)
  const held = kept.decision
  const write = useHeldWrite<DecisionAsk, MissionReceipt>(
    held,
    (next) => change((was) => ({ ...was, decision: next })),
    async (key, ask) => {
      try {
        return await send(key, ask.args)
      } catch (err: unknown) {
        refusal.current = err instanceof ApiError ? decideRefusal(err, briefOf(ask.args.decisionId)) : null
        throw err
      }
    },
    {
      words: kept.decisionRefusal,
      onWords: (words) => change((was) => ({ ...was, decisionRefusal: words })),
      say: (err) => refusal.current ?? refusalWords(err, 'decide'),
    },
  )
  const state: DecideState = held
    ? { status: held.sending ? 'sending' : 'unknown', args: held.ask.args }
    : write.refused !== null
      ? { status: 'rejected', words: write.refused }
      : done
        ? { status: 'done', args: done.args }
        : { status: 'idle' }
  /** This decision, or the one held with no reply again under its key; the receipt once recorded. */
  const run = async (ask: DecisionAsk) => {
    setDone(null)
    const receipt = await write.run(ask)
    if (receipt) setDone(ask)
    return receipt
  }
  return { state, asked: held?.ask ?? done, run }
}
