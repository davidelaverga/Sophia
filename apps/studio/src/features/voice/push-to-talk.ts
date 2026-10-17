// Push to talk (docs/plans/push-to-talk.md): Space held while muted turns the microphone on, and letting go turns it
// off. Only from nowhere (a button, a field or a link keeps its own Space), with no sheet open, Space alone. Pure: what
// a key does, from the call's state; the hook in usePushToTalk.ts wires it.

export interface TalkKey {
  key: string
  repeat: boolean
  /** Shift, Ctrl, Alt or Meta held. */
  modified: boolean
  /** The focus on the page itself, no control. */
  fromNowhere: boolean
  /** A modal sheet open. */
  modal: boolean
}

export type TalkAct = 'start' | 'stop' | 'swallow' | null

export function pushToTalk(phase: 'down' | 'up', key: TalkKey, call: { micOn: boolean; holding: boolean }): TalkAct {
  if (key.key !== ' ') return null
  if (call.holding) return phase === 'up' ? 'stop' : 'swallow'
  const free = !key.repeat && !key.modified && key.fromNowhere && !key.modal
  return phase === 'down' && free && !call.micOn ? 'start' : null
}
