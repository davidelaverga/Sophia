// The personal space and the Work list as server state (react-query), and the writes the three places make. Every
// write has its own Idempotency-Key and is retried once with the SAME key when no reply came (the write may have
// committed); any other refusal is the caller's to say. Nothing is fetched while the personal space is locked.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { PersonalReceipt } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import {
  carryPersonalNote,
  decidePersonalSuggestion,
  erasePersonalSpace,
  forgetPersonalNote,
  getPersonalSpace,
  getPersonalTurns,
  keepPersonalNote,
  listProjects,
  resumePersonalSpace,
  retryPersonalTurn,
  sendPersonalTurn,
  takeBackPersonalRelease,
} from '../../api/personal.ts'
import type { Identity } from '../../app/dev-identity.ts'
import type { Sending } from './conversation-view.ts'
import { writeDraft } from './draft.ts'
import { movedOn } from './write-words.ts'

/** How often a client waiting for Sophia asks. */
const POLL_MS = 700

/** Once with a fresh key, then once more with the SAME key if no reply came: never a second write. */
async function once(run: (key: string) => Promise<PersonalReceipt>): Promise<PersonalReceipt> {
  const key = crypto.randomUUID()
  try {
    return await run(key)
  } catch (err: unknown) {
    if (err instanceof ApiError && err.code === 'outcome_unknown') return run(key)
    throw err
  }
}

/**
 * The space, and while a reply is pending, what came after the last turn until nothing is. The server says how each
 * reply stands, a lost wait included (it reads as failed in time), so this side keeps no clock of its own. A poll that
 * fails stops polling until the space is read again (focus, reconnecting, a write).
 */
export function usePersonalSpace(identity: Identity, open: boolean) {
  const client = useQueryClient()
  const queryKey = ['personal', identity.name]
  const space = useQuery({ queryKey, queryFn: () => getPersonalSpace(identity.token), enabled: open })
  const turns = space.data?.turns ?? []
  const waiting = turns.some((t) => t.reply === 'pending')
  const last = turns.at(-1)?.seq ?? 0
  useQuery({
    queryKey: [...queryKey, 'waiting', last],
    queryFn: async () => {
      const page = await getPersonalTurns(identity.token, last)
      if (!page.pending || page.turns.length > 0) await client.invalidateQueries({ queryKey, exact: true })
      return page
    },
    enabled: open && waiting,
    refetchInterval: (query) => (query.state.status === 'error' ? false : POLL_MS),
  })
  return space
}

export function useProjects(identity: Identity) {
  return useQuery({
    queryKey: ['projects', identity.name],
    queryFn: () => listProjects(identity.token),
    // Who is in a room and when a session starts change without us: the Work side reads them again now and then.
    refetchInterval: 20_000,
  })
}

/**
 * The personal writes, each refreshing what it changed, and what a refusal says moved on ("This is how it is now":
 * movedOn). `sending` shows a message at once, before its receipt.
 */
export function usePersonalWrites(identity: Identity) {
  const client = useQueryClient()
  const [sending, setSending] = useState<Sending | null>(null)
  const [welcoming, setWelcoming] = useState(false)
  const [erasures, setErasures] = useState(0)
  const { token } = identity
  const refresh = async (projects = false) => {
    await client.invalidateQueries({ queryKey: ['personal', identity.name], exact: true })
    if (projects) await client.invalidateQueries({ queryKey: ['projects', identity.name] })
  }
  const run = async (write: (key: string) => Promise<PersonalReceipt>, projects = false) => {
    try {
      const receipt = await once(write)
      await refresh(projects)
      return receipt
    } catch (err: unknown) {
      if (movedOn(err)) await refresh(projects)
      throw err
    }
  }
  return {
    sending,
    /** Sophia is writing her welcome back. */
    welcoming,
    /** Moves with each erasure: the composer starts afresh, its draft forgotten with everything else. */
    erasures,
    resume: async (name: string | null) => {
      setWelcoming(true)
      try {
        return await run((k) => resumePersonalSpace(token, k, name))
      } finally {
        setWelcoming(false)
      }
    },
    send: async (text: string) => {
      setSending({ text, at: new Date() })
      try {
        return await run((k) => sendPersonalTurn(token, k, text))
      } finally {
        setSending(null)
      }
    },
    retry: (turnId: string) => run((k) => retryPersonalTurn(token, k, turnId)),
    decide: (suggestionId: string, decision: 'keep' | 'dismiss') =>
      run((k) => decidePersonalSuggestion(token, k, suggestionId, decision)),
    keep: (text: string, fromTurnId: string, suggestionId: string | null) =>
      run((k) => keepPersonalNote(token, k, { text, fromTurnId, ...(suggestionId ? { suggestionId } : {}) })),
    forget: (noteId: string) => run((k) => forgetPersonalNote(token, k, noteId)),
    carry: (noteId: string, projectId: string) => run((k) => carryPersonalNote(token, k, noteId, projectId), true),
    takeBack: (releaseId: string) => run((k) => takeBackPersonalRelease(token, k, releaseId), true),
    erase: async () => {
      const receipt = await run((k) => erasePersonalSpace(token, k))
      writeDraft(identity.name, '')
      setErasures((n) => n + 1)
      return receipt
    },
  }
}

export type PersonalWrites = ReturnType<typeof usePersonalWrites>
