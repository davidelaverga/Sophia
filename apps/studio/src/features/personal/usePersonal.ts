// The personal space and the Work list as server state (react-query), and the writes the three places make. Every
// write has its own Idempotency-Key and is retried once with the SAME key when no reply came, while its first attempt
// is recent (once.ts); any other refusal is the caller's to say. Nothing is fetched while the personal space is locked.
import { stillSignedIn } from '../../app/signed-in.ts'
import { useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { PersonalReceipt, ProjectList } from '@sophia/contracts'
import {
  carryPersonalNote,
  decidePersonalSuggestion,
  erasePersonalSpace,
  forgetPersonalNote,
  getEarlierPersonalTurns,
  getPersonalTurns,
  controlledPinned,
  isControlled,
  pinControlled,
  protocolKey,
  keepPersonalNote,
  listProjects,
  readControlledWindow,
  readPersonalSpace,
  refusedAsControlled,
  resumePersonalSpace,
  retryPersonalTurn,
  sendPersonalTurn,
  takeBackPersonalRelease,
  type ControlledRead,
  type ReadPlan,
  type ShownTurn,
  type SpaceRead,
  type ViewsRead,
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

const NO_TURNS: readonly ShownTurn[] = []

/** This device's time zone, for the space's `days`: the browser's own, when it names one. */
function zoneHere(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

/** The oldest seq a controlled read has read back to (its earlier windows), or null: the next round reads to it. */
const readBackFrom = (read: ControlledRead): number | null => read.back[0]?.page.turns[0]?.seq ?? null

/** How the space is read now: pinned to the controlled read once C5 said so, and how far back it was read. */
function planOf(client: QueryClient, name: string): ReadPlan {
  const cached = client.getQueryData<SpaceRead>(['personal', name])
  const controlled = cached !== undefined && isControlled(cached)
  return {
    pinned: controlled || controlledPinned(client, name),
    from: controlled ? readBackFrom(cached) : null,
  }
}

/**
 * The space, its days counted in this device's time zone; a zone the server doesn't know counts them in UTC. Read the
 * old way until C5 refuses it as controlled (readPersonalSpace), then pinned to the controlled read.
 */
async function readSpace(client: QueryClient, identity: Identity, signal: AbortSignal): Promise<SpaceRead> {
  const zone = zoneHere()
  const pin = () => pinControlled(client, identity.name)
  try {
    return await readPersonalSpace(identity.token, zone, planOf(client, identity.name), pin, signal)
  } catch (err: unknown) {
    if (zone && err instanceof ApiError && err.code === 'invalid_request')
      return readPersonalSpace(identity.token, null, planOf(client, identity.name), pin, signal)
    throw err
  }
}

/** A legacy poll or earlier page can be the first read refused as controlled after another device changes it. */
export async function readControlledAfterRefusal(
  client: QueryClient,
  account: string,
  err: unknown,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted()
  if (!refusedAsControlled(err)) return false
  // Another read may already have switched it; keep that controlled read on its way.
  if (controlledPinned(client, account)) return true
  pinControlled(client, account)
  await client.invalidateQueries({ queryKey: ['personal', account], exact: true })
  return true
}

/**
 * How often a controlled space is read again while it is open and the page in sight (react-query stops in the
 * background, and nothing is read while the padlock is shut): its calls' money, what was kept of them and a wait that
 * lapsed change without the space's revision (A3-R3 seam §4), so it is read whole now and then, pending or not.
 */
export const CONTROLLED_FRESH_MS = 20_000

/** The next controlled read: soon while a reply is pending (pollEvery), else CONTROLLED_FRESH_MS; none for the old. */
const controlledEvery = (data: SpaceRead | undefined, failures: number): number | false => {
  if (!data || !isControlled(data)) return false
  return data.pending ? pollEvery(failures) : CONTROLLED_FRESH_MS
}

/**
 * The space, and while a reply is pending, what came after the last turn until nothing is. The server says how each
 * reply stands, a lost wait included (it reads as failed in time), so this side keeps no clock of its own. A poll that
 * fails is retried less often (pollEvery); only C5's refusal switches it to the controlled read and stops old polls.
 * A controlled space is read whole again instead (controlledEvery); once C5 pinned it, nothing read the old way
 * shows, not even what was read before.
 */
export function usePersonalSpace(identity: Identity, open: boolean) {
  const client = useQueryClient()
  const queryKey = ['personal', identity.name]
  // Each read stops when its query is called off (the padlock shut: useForgetWhileLocked).
  const space = useQuery({
    queryKey,
    queryFn: ({ signal }) => readSpace(client, identity, signal),
    enabled: open,
    refetchInterval: (query) => controlledEvery(query.state.data, query.state.fetchFailureCount),
  })
  // Observed, so a pin set now shows at once; never read itself (it says only what C5 set), never collected on its own.
  const pin = protocolKey(identity.name)
  const pinned =
    useQuery({
      queryKey: pin,
      queryFn: () => client.getQueryData<string>(pin) ?? 'legacy',
      enabled: false,
      gcTime: Number.POSITIVE_INFINITY,
    }).data === 'controlled'
  const legacy = space.data !== undefined && !isControlled(space.data) ? space.data : undefined
  const waiting = legacy?.turns.some((t) => t.reply === 'pending') ?? false
  const last = legacy?.turns.at(-1)?.seq ?? 0
  useQuery({
    queryKey: [...queryKey, 'waiting', last],
    queryFn: async ({ signal }) => {
      if (controlledPinned(client, identity.name)) return null
      try {
        const page = await getPersonalTurns(identity.token, last, signal)
        if (controlledPinned(client, identity.name)) return null
        if (!page.pending || page.turns.length > 0) await client.invalidateQueries({ queryKey, exact: true })
        return page
      } catch (err: unknown) {
        if (await readControlledAfterRefusal(client, identity.name, err, signal)) return null
        throw err
      }
    },
    enabled: open && waiting && !pinned,
    refetchInterval: (query) => pollEvery(query.state.fetchFailureCount),
  })
  return pinned && legacy ? { ...space, data: undefined } : space
}

/** The read-back of a controlled space: its earlier windows' turns, oldest first, and whether more exist. */
function controlledBack(read: ControlledRead): { older: readonly ShownTurn[]; more: boolean } {
  return {
    older: read.back.flatMap((w) => w.page.turns),
    more: read.back[0]?.page.earlier ?? read.earlier,
  }
}

/** What was read back, as shown: a controlled read's own windows, else this page's, in the space's epoch. */
function shownBack(space: SpaceRead | undefined, back: ReadBackState | null) {
  if (space && isControlled(space)) return controlledBack(space)
  const current = back && space && back.epoch === space.epoch ? back : null
  return { older: current?.turns ?? NO_TURNS, more: current ? current.more : (space?.earlier ?? false) }
}

/**
 * One more window of a controlled space read back, with its inputs' views bound to it (readControlledWindow), joined
 * to the cached read only while that read is still the one shown and the window holds with it: its revision, its epoch
 * and each input's control as its page has it (R01). One that doesn't hold isn't joined: the space is read whole again
 * instead (a round reads it back as far as was read, and says it is stale if it still isn't whole).
 *
 * The read shown is the very read the window was read for, not one like it (R2): when it ended (asOf) is this device's
 * clock, not which read it is, and a read since, even at the same instant, revision and epoch, may know newer money or
 * kept answers. Each read is its own object (its views are new maps), so a read since never takes an older window or
 * its views; it is let go, and Show earlier days reads against the read shown now.
 */
async function readControlledBack(client: QueryClient, identity: Identity, read: ControlledRead, signal: AbortSignal) {
  const before = readBackFrom(read) ?? read.turns[0]?.seq
  if (before === undefined) return
  const viewed: ViewsRead = { views: new Map(), at: new Map() }
  const window = await readControlledWindow(identity.token, before, read, viewed, signal)
  const key = ['personal', identity.name]
  const now = client.getQueryData<SpaceRead>(key)
  if (now !== read || !isControlled(now) || now.asOf !== read.asOf) return
  if (window && window.page.epoch === now.epoch && window.page.revision === now.revision) {
    const joined: ControlledRead = {
      ...now,
      back: [window, ...now.back],
      views: new Map([...now.views, ...viewed.views]),
      viewAt: new Map([...now.viewAt, ...viewed.at]),
    }
    client.setQueryData<SpaceRead>(key, joined)
    // A refresh already on its way planned fewer days. Start it again from the new read-back boundary.
    if (client.getQueryState(key)?.fetchStatus !== 'idle') {
      void client.invalidateQueries({ queryKey: key, exact: true }, { cancelRefetch: true })
    }
  } else await client.invalidateQueries({ queryKey: key, exact: true })
}

/**
 * A long conversation read back a page at a time, before the newest turns the space lists: what was read so far
 * (oldest first), whether more exist, and the next page. What leaves the window as new turns come stays
 * (backOnSpaceRead), and a page joins what was read back by the time it arrives (withEarlierPage); an erasure (a new
 * epoch) lets it go, and so does a lock. A controlled space keeps what it read back in its own read (readControlledBack),
 * read again with it each round.
 */
export function useReadBack(identity: Identity, space: SpaceRead | undefined) {
  const client = useQueryClient()
  const [back, setBack] = useState<ReadBackState | null>(null)
  // The page on its way, stopped when the padlock shuts.
  const reading = useRef<AbortController | null>(null)
  const listed = useRef<readonly ShownTurn[]>(NO_TURNS)
  // The epoch of the space shown now, null while it is locked: a page that arrives for another is let go.
  const shown = useRef<number | null>(null)
  // The page on its way stops when this goes too: the account left, or a project opened over the places.
  useEffect(() => () => reading.current?.abort(), [])
  useEffect(() => {
    const before = listed.current
    listed.current = space?.turns ?? NO_TURNS
    shown.current = space?.epoch ?? null
    // Locked (or not read yet): nothing is read back, and nothing read back is kept.
    if (!space) reading.current?.abort()
    if (space && !isControlled(space)) setBack((now) => backOnSpaceRead(now, before, space))
    else setBack(null)
  }, [space])
  const { older, more } = shownBack(space, back)
  const legacyBack = async (epoch: number, from: number, signal: AbortSignal) => {
    if (controlledPinned(client, identity.name)) return
    try {
      const page = await getEarlierPersonalTurns(identity.token, from, signal)
      if (controlledPinned(client, identity.name)) return
      if (shown.current !== epoch) return // shut (or erased) while it was on its way: none of it is kept
      setBack((now) => withEarlierPage(now, epoch, page))
    } catch (err: unknown) {
      if (await readControlledAfterRefusal(client, identity.name, err, signal)) return
      throw err
    }
  }
  const read = async () => {
    const from = older[0]?.seq ?? space?.turns[0]?.seq
    if (!space || from === undefined || !more || reading.current) return
    const stop = new AbortController()
    reading.current = stop
    try {
      await (isControlled(space)
        ? readControlledBack(client, identity, space, stop.signal)
        : legacyBack(space.epoch, from, stop.signal))
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
export function useReadAgainOnErasure(identity: Identity, space: SpaceRead | undefined, work: ProjectList | undefined) {
  const client = useQueryClient()
  const seen = erasedElsewhere(space, work)
  useEffect(() => {
    if (seen) void readAfresh(client, identity.name)
  }, [seen, client, identity.name])
}

/** The person's project list as Home, Work and a room's presence read it (one-truth.md): one key, one pace. */
export const projectsQuery = (identity: Pick<Identity, 'name' | 'token'>) => ({
  queryKey: ['projects', identity.name],
  queryFn: ({ signal }: { signal: AbortSignal }) => listProjects(identity.token, signal), // an account that leaves stops its read
  // Who is in a room and when a session starts change without us: the Work side reads them again now and then.
  refetchInterval: 20_000,
})

export function useProjects(identity: Identity) {
  return useQuery(projectsQuery(identity))
}

/** A message asked to go while another is on its way: it waits, as the field's words do. */
export class OnItsWay extends Error {}

/** The epoch this page last read (epochNow): the space's when it is read, else the Work list's. */
const epochRead = (client: QueryClient, name: string) =>
  epochNow(client.getQueryData<SpaceRead>(['personal', name]), client.getQueryData<ProjectList>(['projects', name]))

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
      if (projects) {
        await readUntilRead(client, work)
        // A carry or a take-back changes what the project shows as carried in, too (CarriedIn).
        await client.invalidateQueries({ queryKey: ['vision', 'carried-in', identity.name] })
      }
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
    // A note written straight into the notes has no turn behind it (personal-notes-write-find.md).
    keep: (text: string, fromTurnId: string | null, suggestionId: string | null) =>
      run((k, at) =>
        keepPersonalNote(token, k, at, {
          text,
          ...(fromTurnId ? { fromTurnId } : {}),
          ...(suggestionId ? { suggestionId } : {}),
        }),
      ),
    forget: (noteId: string) => run((k, at) => forgetPersonalNote(token, k, at, noteId)),
    carry: (noteId: string, projectId: string) =>
      run((k, at) => carryPersonalNote(token, k, at, noteId, projectId), true),
    /** `key`: the take-back's own, when it is asked again after no answer came back (it may have come back). */
    takeBack: (releaseId: string, key?: string) =>
      run((k, at) => takeBackPersonalRelease(token, k, at, releaseId), true, key),
    erase: () => eraseSpace(client, identity, () => setErasures((n) => n + 1)),
    /** The account these writes are under is still signed in here (signed-in.ts): not after leaving, or another. */
    here: () => stillSignedIn(accountOf(identity)),
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
