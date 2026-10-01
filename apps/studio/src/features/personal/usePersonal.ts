// The personal space and the Work list as server state (react-query), and the writes the three places make. Every
// write has its own Idempotency-Key and is retried once with the SAME key when no reply came, while its first attempt
// is recent (once.ts); any other refusal is the caller's to say. Nothing is fetched while the personal space is locked.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { PersonalReceipt, PersonalSpace, PersonalTurn, ProjectList } from '@sophia/contracts'
import {
  carryPersonalNote,
  decidePersonalSuggestion,
  erasePersonalSpace,
  forgetPersonalNote,
  getEarlierPersonalTurns,
  getPersonalSpace,
  getPersonalTurns,
  keepPersonalNote,
  listProjects,
  resumePersonalSpace,
  retryPersonalTurn,
  sendPersonalTurn,
  takeBackPersonalRelease,
} from '../../api/personal.ts'
import { ApiError } from '../../api/client.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { keptOnReadBack, type Sending } from './conversation-view.ts'
import { writeDraft } from './draft.ts'
import { epochNow } from './epoch.ts'
import { once } from './once.ts'
import { readsAgain } from './write-words.ts'

/** How often a client waiting for Sophia asks. */
const POLL_MS = 700

const NO_TURNS: readonly PersonalTurn[] = []

/** This device's time zone, for the space's `days`: the browser's own, when it names one. */
function zoneHere(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

/** The space, its days counted in this device's time zone; a zone the server doesn't know counts them in UTC. */
async function readSpace(token: string) {
  const zone = zoneHere()
  try {
    return await getPersonalSpace(token, zone)
  } catch (err: unknown) {
    if (zone && err instanceof ApiError && err.code === 'invalid_request') return getPersonalSpace(token, null)
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
  const space = useQuery({ queryKey, queryFn: () => readSpace(identity.token), enabled: open })
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

/**
 * A long conversation read back a page at a time, before the newest turns the space lists: what was read so far
 * (oldest first), whether more exist, and the next page. What leaves the window as new turns come stays
 * (keptOnReadBack); an erasure (a new epoch) starts again, and a lock lets all of it go.
 */
export function useReadBack(identity: Identity, space: PersonalSpace | undefined) {
  const [back, setBack] = useState<{ epoch: number; turns: readonly PersonalTurn[]; more: boolean } | null>(null)
  const reading = useRef(false)
  const listed = useRef<readonly PersonalTurn[]>(NO_TURNS)
  // The epoch of the space shown now, null while it is locked: a page that arrives for another is let go.
  const shown = useRef<number | null>(null)
  useEffect(() => {
    const before = listed.current
    listed.current = space?.turns ?? NO_TURNS
    shown.current = space?.epoch ?? null
    if (!space) {
      setBack(null) // locked (or not read yet): nothing read back is kept
      return
    }
    setBack((now) => {
      if (now?.epoch !== space.epoch) return now
      const turns = keptOnReadBack(now.turns, before, space.turns)
      return turns === now.turns ? now : { ...now, turns }
    })
  }, [space])
  const current = back && space && back.epoch === space.epoch ? back : null
  const older = current?.turns ?? NO_TURNS
  const more = current ? current.more : (space?.earlier ?? false)
  const readMore = async () => {
    const from = older[0]?.seq ?? space?.turns[0]?.seq
    if (!space || from === undefined || !more || reading.current) return
    reading.current = true
    const { epoch } = space
    try {
      const page = await getEarlierPersonalTurns(identity.token, from)
      if (shown.current !== epoch) return // shut (or erased) while it was on its way: none of it is kept
      setBack({ epoch, turns: [...page.turns, ...older], more: page.earlier })
    } finally {
      reading.current = false
    }
  }
  return { older, more, readMore }
}

export type ReadBack = ReturnType<typeof useReadBack>

export function useProjects(identity: Identity) {
  return useQuery({
    queryKey: ['projects', identity.name],
    queryFn: () => listProjects(identity.token),
    // Who is in a room and when a session starts change without us: the Work side reads them again now and then.
    refetchInterval: 20_000,
  })
}

/** A message asked to go while another is on its way: it waits, as the field's words do. */
export class OnItsWay extends Error {}

/**
 * A personal write, run once (once.ts) against the epoch this page last read (epoch.ts): its retry names the same one,
 * so an erasure in between refuses both and nothing from before it lands after it. Then what it changed is read again,
 * and so is what a refusal or a lost answer may have changed ("This is how it is now": readsAgain).
 */
function useRun(identity: Identity) {
  const client = useQueryClient()
  const refresh = async (projects = false) => {
    await client.invalidateQueries({ queryKey: ['personal', identity.name], exact: true })
    if (projects) await client.invalidateQueries({ queryKey: ['projects', identity.name] })
  }
  return async (write: (key: string, epoch: number) => Promise<PersonalReceipt>, projects = false) => {
    const at = epochNow(
      client.getQueryData<PersonalSpace>(['personal', identity.name]),
      client.getQueryData<ProjectList>(['projects', identity.name]),
    )
    try {
      const receipt = await once((key) => write(key, at))
      await refresh(projects)
      return receipt
    } catch (err: unknown) {
      if (readsAgain(err)) await refresh(projects)
      throw err
    }
  }
}

/**
 * The personal writes, each refreshing what it changed. `sending` shows a message at once, before its receipt; one is
 * on its way at a time, from the field or a way to start (OnItsWay, `busy`), so the conversation shows them in order.
 * While the padlock is shut (`locked`) the page keeps none of its words: the message on its way goes on unseen.
 */
export function usePersonalWrites(identity: Identity, locked: boolean) {
  const run = useRun(identity)
  const [sending, setSending] = useState<Sending | null>(null)
  const [busy, setBusy] = useState(false)
  const onItsWay = useRef(false)
  useEffect(() => {
    if (locked) setSending(null)
  }, [locked])
  const [welcoming, setWelcoming] = useState(false)
  const [erasures, setErasures] = useState(0)
  const { token } = identity
  return {
    sending,
    /** A message is on its way (its words may be let go: a lock). */
    busy,
    /** Sophia is writing her welcome back. */
    welcoming,
    /** Moves with each erasure: the composer starts afresh, its draft forgotten with everything else. */
    erasures,
    resume: async (name: string | null) => {
      setWelcoming(true)
      try {
        return await run((k, at) => resumePersonalSpace(token, k, at, name))
      } finally {
        setWelcoming(false)
      }
    },
    send: async (text: string) => {
      if (onItsWay.current) throw new OnItsWay('Another message is on its way')
      onItsWay.current = true
      setBusy(true)
      setSending({ text, at: new Date() })
      try {
        return await run((k, at) => sendPersonalTurn(token, k, at, text))
      } finally {
        onItsWay.current = false
        setBusy(false)
        setSending(null)
      }
    },
    retry: (turnId: string) => run((k, at) => retryPersonalTurn(token, k, at, turnId)),
    decide: (suggestionId: string, decision: 'keep' | 'dismiss') =>
      run((k, at) => decidePersonalSuggestion(token, k, at, suggestionId, decision)),
    keep: (text: string, fromTurnId: string, suggestionId: string | null) =>
      run((k, at) => keepPersonalNote(token, k, at, { text, fromTurnId, ...(suggestionId ? { suggestionId } : {}) })),
    forget: (noteId: string) => run((k, at) => forgetPersonalNote(token, k, at, noteId)),
    carry: (noteId: string, projectId: string) =>
      run((k, at) => carryPersonalNote(token, k, at, noteId, projectId), true),
    takeBack: (releaseId: string) => run((k, at) => takeBackPersonalRelease(token, k, at, releaseId), true),
    erase: async () => {
      const receipt = await run((k) => erasePersonalSpace(token, k))
      writeDraft(accountOf(identity), '')
      setErasures((n) => n + 1)
      return receipt
    },
  }
}

export type PersonalWrites = ReturnType<typeof usePersonalWrites>
