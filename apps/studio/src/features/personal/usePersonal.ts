// The personal space and the Work list as server state (react-query), and the writes the three places make. Every
// write has its own Idempotency-Key and is retried once with the SAME key when no reply came, while its first attempt
// is recent (once.ts); any other refusal is the caller's to say. Nothing is fetched while the personal space is locked.
import { useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
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
import { backOnSpaceRead, withEarlierPage, type ReadBackState, type Sending } from './conversation-view.ts'
import { forgetDraft } from './draft.ts'
import { epochNow, erasedElsewhere } from './epoch.ts'
import { once } from './once.ts'
import { pollEvery } from './polling.ts'
import { useSharedRead } from './shared-read.ts'
import { readsAgain, refusedAsErased } from './write-words.ts'

/** How often a client waiting for Sophia asks. */

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
async function readSpace(token: string, signal: AbortSignal) {
  const zone = zoneHere()
  try {
    return await getPersonalSpace(token, zone, signal)
  } catch (err: unknown) {
    if (zone && err instanceof ApiError && err.code === 'invalid_request') return getPersonalSpace(token, null, signal)
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
  // Each read stops when its query is called off (the padlock shut: useForgetWhileLocked).
  const space = useQuery({ queryKey, queryFn: ({ signal }) => readSpace(identity.token, signal), enabled: open })
  const turns = space.data?.turns ?? []
  const waiting = turns.some((t) => t.reply === 'pending')
  const last = turns.at(-1)?.seq ?? 0
  useQuery({
    queryKey: [...queryKey, 'waiting', last],
    queryFn: async ({ signal }) => {
      const page = await getPersonalTurns(identity.token, last, signal)
      if (!page.pending || page.turns.length > 0) await client.invalidateQueries({ queryKey, exact: true })
      return page
    },
    enabled: open && waiting,
    refetchInterval: (query) => pollEvery(query.state.fetchFailureCount),
  })
  return space
}

/**
 * A long conversation read back a page at a time, before the newest turns the space lists: what was read so far
 * (oldest first), whether more exist, and the next page. What leaves the window as new turns come stays
 * (backOnSpaceRead), and a page joins what was read back by the time it arrives (withEarlierPage); an erasure (a new
 * epoch) lets it go, and so does a lock.
 */
export function useReadBack(identity: Identity, space: PersonalSpace | undefined) {
  const [back, setBack] = useState<ReadBackState | null>(null)
  // The page on its way, stopped when the padlock shuts.
  const reading = useRef<AbortController | null>(null)
  const listed = useRef<readonly PersonalTurn[]>(NO_TURNS)
  // The epoch of the space shown now, null while it is locked: a page that arrives for another is let go.
  const shown = useRef<number | null>(null)
  // The page on its way stops when this goes too: the account left, or a project opened over the places.
  useEffect(() => () => reading.current?.abort(), [])
  useEffect(() => {
    const before = listed.current
    listed.current = space?.turns ?? NO_TURNS
    shown.current = space?.epoch ?? null
    if (!space) {
      reading.current?.abort() // locked (or not read yet): nothing is read back, and nothing read back is kept
      setBack(null)
      return
    }
    setBack((now) => backOnSpaceRead(now, before, space))
  }, [space])
  const current = back && space && back.epoch === space.epoch ? back : null
  const older = current?.turns ?? NO_TURNS
  const more = current ? current.more : (space?.earlier ?? false)
  const read = async () => {
    const from = older[0]?.seq ?? space?.turns[0]?.seq
    if (!space || from === undefined || !more || reading.current) return
    const stop = new AbortController()
    reading.current = stop
    const { epoch } = space
    try {
      const page = await getEarlierPersonalTurns(identity.token, from, stop.signal)
      if (shown.current !== epoch) return // shut (or erased) while it was on its way: none of it is kept
      setBack((now) => withEarlierPage(now, epoch, page))
    } catch (err: unknown) {
      if (!stop.signal.aborted) throw err // stopped by the padlock: nothing to say
    } finally {
      reading.current = null
    }
  }
  const shared = useSharedRead(read)
  return { older, more, readMore: shared.run, reading: shared.reading }
}

export type ReadBack = ReturnType<typeof useReadBack>

/**
 * After an erasure, everything read of the space goes at once (the space, and the turns waited for) and it is read
 * afresh: a read that fails then says so, with Try again, and shows none of what was erased.
 */
const readAfresh = (client: QueryClient, name: string) => client.resetQueries({ queryKey: ['personal', name] })

/**
 * After a write, the space is read again until a read works, less and less often while reads fail (pollEvery): what
 * the write changed shows before it settles (a message stays on its way until then). A space nobody shows now (the
 * padlock shut, the page gone) ends the wait.
 */
async function readUntilRead(client: QueryClient, queryKey: QueryKey): Promise<void> {
  for (let failures = 0; ; failures += 1) {
    try {
      await client.invalidateQueries({ queryKey, exact: true }, { throwOnError: true })
      return
    } catch {
      if (!client.getQueryCache().find({ queryKey, exact: true })?.isActive()) return
      await new Promise((wake) => setTimeout(wake, pollEvery(failures)))
    }
  }
}

/**
 * An erasure on another device, once this page hears of it from the Work list (erasedElsewhere): the space is read
 * afresh (readAfresh), so neither its conversation nor its draft stays in sight, also while reads fail.
 */
export function useReadAgainOnErasure(
  identity: Identity,
  space: PersonalSpace | undefined,
  work: ProjectList | undefined,
) {
  const client = useQueryClient()
  const seen = erasedElsewhere(space, work)
  useEffect(() => {
    if (seen) void readAfresh(client, identity.name)
  }, [seen, client, identity.name])
}

export function useProjects(identity: Identity) {
  return useQuery({
    queryKey: ['projects', identity.name],
    queryFn: ({ signal }) => listProjects(identity.token, signal), // an account that leaves stops its read
    // Who is in a room and when a session starts change without us: the Work side reads them again now and then.
    refetchInterval: 20_000,
  })
}

/** A message asked to go while another is on its way: it waits, as the field's words do. */
export class OnItsWay extends Error {}

/** The epoch this page last read (epochNow): the space's when it is read, else the Work list's. */
const epochRead = (client: QueryClient, name: string) =>
  epochNow(client.getQueryData<PersonalSpace>(['personal', name]), client.getQueryData<ProjectList>(['projects', name]))

/**
 * A personal write, run once (once.ts) against the epoch this page last read (epoch.ts): its retry names the same one,
 * so an erasure in between refuses both and nothing from before it lands after it. Then what it changed is read again,
 * and so is what a refusal or a lost answer may have changed ("This is how it is now": readsAgain).
 */
function useRun(identity: Identity) {
  const client = useQueryClient()
  const space = ['personal', identity.name]
  const work = ['projects', identity.name]
  return async (write: (key: string, epoch: number) => Promise<PersonalReceipt>, projects = false, key?: string) => {
    const at = epochRead(client, identity.name)
    try {
      const receipt = await once((k) => write(k, at), Date.now, key)
      // It settles once what it changed can show: the space is read until a read works, and the Work list too when the
      // write changed it (a note carried or taken back). An erasure doesn't come this way (eraseSpace).
      await readUntilRead(client, space)
      if (projects) await readUntilRead(client, work)
      return receipt
    } catch (err: unknown) {
      if (readsAgain(err)) await readAfterRefusal(client, identity.name, err, projects)
      throw err
    }
  }
}

/** After a refusal what it may have changed is read once; refused as erased, what was read goes at once (readAfresh). */
async function readAfterRefusal(client: QueryClient, name: string, err: unknown, projects: boolean) {
  if (refusedAsErased(err)) await readAfresh(client, name)
  else await client.invalidateQueries({ queryKey: ['personal', name], exact: true })
  // A carry or a take-back changes what a project shows as carried in (CarriedIn) as well as Work's list.
  if (projects) {
    await client.invalidateQueries({ queryKey: ['projects', name] })
    await client.invalidateQueries({ queryKey: ['vision', 'carried-in', name] })
  }
}

/**
 * The personal writes, each refreshing what it changed. `sending` shows a message at once, before its receipt; one is
 * on its way at a time, from the field or a way to start (OnItsWay, `busy`), so the conversation shows them in order.
 * While the padlock is shut (`locked`) the page keeps none of its words: the message on its way goes on unseen.
 */
export function usePersonalWrites(identity: Identity, locked: boolean) {
  const client = useQueryClient()
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
    /**
     * Another tab of this device knows of an erasure this page hasn't read (its words are kept in a newer epoch): what
     * was read goes at once and the space is read afresh, as for any erasure (readAfresh).
     */
    readAgain: () => void readAfresh(client, identity.name),
    resume: async (name: string | null) => {
      setWelcoming(true)
      try {
        return await run((k, at) => resumePersonalSpace(token, k, at, name))
      } finally {
        setWelcoming(false)
      }
    },
    /** `key`: the draft's (every tab sends the same draft under it), or none for a way to start. */
    send: async (text: string, key?: string) => {
      if (onItsWay.current) throw new OnItsWay('Another message is on its way')
      onItsWay.current = true
      setBusy(true)
      setSending({ text, at: new Date(), epoch: epochRead(client, identity.name) })
      try {
        return await run((k, at) => sendPersonalTurn(token, k, at, text), false, key)
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
    /** `key`: the take-back's own, when it is asked again after no answer came back (it may have come back). */
    takeBack: (releaseId: string, key?: string) =>
      run((k, at) => takeBackPersonalRelease(token, k, at, releaseId), true, key),
    erase: () => eraseSpace(client, identity, () => setErasures((n) => n + 1)),
  }
}

/**
 * Erasing: confirmed, or with no answer (it may have erased everything, as asked), the draft goes from the device and
 * the field at once (`forgot`: the composer starts afresh) and everything read of the space goes (readAfresh): a read
 * then shows what is really there. A refusal reads the space again, as any write's does.
 */
async function eraseSpace(client: QueryClient, identity: Identity, forgot: () => void): Promise<PersonalReceipt> {
  const forgetAll = async () => {
    forgetDraft(accountOf(identity))
    forgot()
    await readAfresh(client, identity.name)
  }
  try {
    const receipt = await once((k) => erasePersonalSpace(identity.token, k))
    await forgetAll()
    return receipt
  } catch (err: unknown) {
    if (err instanceof ApiError && err.code === 'outcome_unknown') await forgetAll()
    else if (readsAgain(err)) await readAfterRefusal(client, identity.name, err, false)
    throw err
  }
}

export type PersonalWrites = ReturnType<typeof usePersonalWrites>
