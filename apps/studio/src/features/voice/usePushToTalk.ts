// Push to talk in the room (docs/plans/push-to-talk.md): listens in the capture phase, so Space held from nowhere is
// the microphone's before stray typing takes it, and lets go when the key does, when the window loses focus, or when
// the page goes hidden (a phone's app switch, a screen lock), where neither may come (Codex P1 on #381).
import { useContext, useEffect, useRef, useState } from 'react'
import { modalOnScreen, ShortcutScope } from '../../app/shortcuts.ts'
import { pushToTalk, type TalkKey } from './push-to-talk.ts'

const nowhere = (target: EventTarget | null) => target === document.body || target === document.documentElement

/** A key as push to talk reads it. */
const talkKey = (e: KeyboardEvent): TalkKey => ({
  key: e.key,
  repeat: e.repeat,
  modified: e.shiftKey || e.ctrlKey || e.altKey || e.metaKey,
  fromNowhere: nowhere(e.target),
  modal: modalOnScreen(),
})

/**
 * What push to talk asks of the call (ProjectRoom): its microphone, and a fence that stays true until the next
 * microphone choice or another call.
 */
interface TalkRoom {
  setMicrophone: (on: boolean) => Promise<void>
  chosenStill: () => () => boolean
}

/**
 * Whether Space is held to talk now, the microphone on (not while the browser still asks, or refused it: Codex P2 on
 * #381). `room` and `micOn` are the call's. A project kept out of sight takes no Space (Codex P1 on #381).
 */
export function usePushToTalk(micOn: boolean, room: TalkRoom, live: boolean): boolean {
  const scoped = useContext(ShortcutScope)
  const enabled = live && scoped
  const [holding, setHolding] = useState(false)
  const now = useRef({ micOn, holding, room })
  // Its own last turn-off, while still the call's last microphone choice (Codex P2s on #381).
  const off = useRef<() => boolean>(() => false)
  useEffect(() => {
    now.current = { micOn, holding, room }
  })
  useEffect(() => {
    if (!enabled) return undefined
    const mute = () => {
      void now.current.room.setMicrophone(false)
      off.current = now.current.room.chosenStill()
    }
    const stop = () => {
      if (!now.current.holding) return
      now.current.holding = false
      setHolding(false)
      mute()
    }
    const onKey = (phase: 'down' | 'up') => (e: KeyboardEvent) => {
      // A microphone its own turn-off is still taking down counts as off: Space pressed again talks.
      const act = pushToTalk(phase, talkKey(e), { ...now.current, muting: off.current() })
      if (act === null) return
      e.preventDefault()
      if (act === 'start') {
        now.current.holding = true
        setHolding(true)
        // The browser may still be asking when Space is let go, and LiveKit publishes a late enable even after the
        // turn-off stopped waiting for it: a microphone that arrives once Space is up goes off again (Codex P1 on #381),
        // unless a choice was made since (the dock's, another Space) or the call is another (Codex P2 on #381).
        void now.current.room
          .setMicrophone(true)
          .then(() => (!now.current.holding && off.current() ? mute() : undefined))
      } else if (act === 'stop') stop()
    }
    const down = onKey('down')
    const up = onKey('up')
    const hidden = () => {
      if (document.hidden) stop()
    }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', stop)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', stop)
      document.removeEventListener('visibilitychange', hidden)
      stop()
    }
  }, [enabled])
  return holding && micOn
}
