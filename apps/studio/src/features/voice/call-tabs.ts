// Which calls the other tabs of this browser hold (call-rejoin.md; costuras seam #3): a dropped call's try back in
// never takes the call from a tab the person moved to. Each room says on one BroadcastChannel when it is joining, in a
// call or out of it, scoped by the LiveKit room and the person in it (a guest's tab, or another project's call, never
// counts), and a tab that opens asks who is. A tab that went away without saying so (a crash) is still counted: the try
// then waits for the person, which errs towards never taking the call. Where the browser has no BroadcastChannel, no
// other tab is heard of. Other devices aren't: that needs the room's own presence (a follow-up).

const CHANNEL = 'sophia.calls.v2'

/** Where a room of a tab stands in its call. */
export type ClaimState = 'joining' | 'in'

/** A room of some tab, for a call (`scope`: the LiveKit room and the person), joining, in, or out (null). */
interface Claim {
  room: string
  scope: string
  state: ClaimState | null
}

/** As much of a BroadcastChannel as this reads. A BroadcastChannel takes no target origin: it reaches this origin. */
export interface TabChannel {
  postMessage: (message: unknown) => void
  addEventListener: (type: 'message', listener: (e: { data: unknown }) => void) => void
}

/** Where the tabs' channel comes from, and how a tab going away is heard. */
export interface TabsEnv {
  open: () => TabChannel | null
  onLeave: (fn: () => void) => void
}

const isClaim = (data: unknown): data is Claim =>
  typeof data === 'object' &&
  data !== null &&
  'room' in data &&
  typeof data.room === 'string' &&
  'scope' in data &&
  typeof data.scope === 'string' &&
  'state' in data &&
  (data.state === 'joining' || data.state === 'in' || data.state === null)

/** A message to the other tabs; a BroadcastChannel takes no target origin. */
// oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel.postMessage has no origin
const post = (ch: TabChannel, message: Claim | { ask: true }) => ch.postMessage(message)

const isAsked = (data: unknown): boolean =>
  typeof data === 'object' && data !== null && 'ask' in data && data.ask === true

/** One tab's view: what it says of its rooms, and which calls the other tabs hold. */
export function callTabs(env: TabsEnv) {
  /** The other tabs' rooms in a call or joining, with their scopes; this tab's own claims. */
  const theirs = new Map<string, string>()
  const mine = new Map<string, Claim>()
  let channel: TabChannel | null | undefined
  const answer = (ch: TabChannel) => {
    for (const claim of mine.values()) post(ch, claim)
  }
  const heard = (data: unknown) => {
    if (isAsked(data) && channel) answer(channel)
    else if (isClaim(data) && data.state) theirs.set(data.room, data.scope)
    else if (isClaim(data)) theirs.delete(data.room)
  }
  const opened = (): TabChannel | null => {
    if (channel !== undefined) return channel
    const ch = env.open()
    channel = ch
    if (!ch) return null
    ch.addEventListener('message', (e) => heard(e.data))
    env.onLeave(() => {
      for (const claim of mine.values()) post(ch, { ...claim, state: null })
    })
    post(ch, { ask: true })
    return ch
  }
  return {
    /** This tab's room `room` stands so in the call `scope`: said to the other tabs when it changes. */
    say(room: string, scope: string, state: ClaimState | null): void {
      const ch = opened()
      const was = mine.get(room)
      if ((was?.state ?? null) === state && (state === null || was?.scope === scope)) return
      const claim = { room, scope, state }
      if (state) mine.set(room, claim)
      else mine.delete(room)
      if (ch) post(ch, claim)
    },
    /** Whether another tab of this browser holds the call `scope`, or is joining it. */
    held(scope: string): boolean {
      opened()
      return [...theirs.values()].includes(scope)
    },
  }
}

/** This browser's tabs: a BroadcastChannel where there is one; a page going away says its calls are over. */
export const browserTabs = callTabs({
  open: () => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)),
  onLeave: (fn) => window.addEventListener('pagehide', fn),
})
