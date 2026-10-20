// Which calls the other tabs of this browser hold (call-rejoin.md; costuras seam #3): a dropped call's try back in
// never takes the call from a tab the person moved to. Each room says, on one BroadcastChannel, when it is in a call and
// when it is out, and a tab that opens asks who is. A tab that went away without saying so (a crash) is still counted:
// the try then waits for the person, which errs towards never taking the call. Where the browser has no
// BroadcastChannel, no other tab is heard of. Other devices aren't: that needs the room's own presence (a follow-up).

const CHANNEL = 'sophia.calls.v1'

/** A room of another tab, in a call or out of it. */
interface Said {
  room: string
  inCall: boolean
}

const isSaid = (data: unknown): data is Said =>
  typeof data === 'object' &&
  data !== null &&
  'room' in data &&
  typeof data.room === 'string' &&
  'inCall' in data &&
  typeof data.inCall === 'boolean'

const isAsked = (data: unknown): boolean =>
  typeof data === 'object' && data !== null && 'ask' in data && data.ask === true

/** The rooms of other tabs heard in a call; this tab's own. */
const theirs = new Set<string>()
const mine = new Set<string>()
let channel: BroadcastChannel | null | undefined

/** A message to the other tabs. A BroadcastChannel takes no target origin: it reaches this origin's tabs alone. */
// oxlint-disable-next-line unicorn/require-post-message-target-origin -- BroadcastChannel.postMessage has no origin
const post = (ch: BroadcastChannel, message: Said | { ask: true }) => ch.postMessage(message)

/** The channel, opened once per tab: it answers who is in a call, and says this tab's calls are over as it goes. */
function opened(): BroadcastChannel | null {
  if (channel !== undefined) return channel
  if (typeof BroadcastChannel === 'undefined') return (channel = null)
  const ch = new BroadcastChannel(CHANNEL)
  ch.addEventListener('message', (e) => {
    const data: unknown = e.data
    if (isAsked(data)) for (const room of mine) post(ch, { room, inCall: true })
    else if (isSaid(data) && data.inCall) theirs.add(data.room)
    else if (isSaid(data)) theirs.delete(data.room)
  })
  window.addEventListener('pagehide', () => {
    for (const room of mine) post(ch, { room, inCall: false })
  })
  post(ch, { ask: true })
  channel = ch
  return ch
}

/** This tab's room `room` is in a call, or out of it: said to the other tabs when it changes. */
export function sayInCall(room: string, inCall: boolean): void {
  const ch = opened()
  if (inCall === mine.has(room)) return
  if (inCall) mine.add(room)
  else mine.delete(room)
  if (ch) post(ch, { room, inCall })
}

/** Whether another tab of this browser holds a call. */
export function anotherTabInCall(): boolean {
  opened()
  return theirs.size > 0
}
