// Push to talk in the room (docs/plans/push-to-talk.md): listens in the capture phase, so Space held from nowhere is
// the microphone's before stray typing takes it, and lets go when the key does, when the window loses focus, or when
// the page goes hidden (a phone's app switch, a screen lock), where neither may come (Codex P1 on #381).
import { useContext, useEffect, useRef, useState } from 'react'
import { modalOnScreen, ShortcutScope } from '../../app/shortcuts.ts'
import { pushToTalk } from './push-to-talk.ts'

const nowhere = (target: EventTarget | null) => target === document.body || target === document.documentElement

/**
 * Whether Space is held to talk now, the microphone on (not while the browser still asks, or refused it: Codex P2 on
 * #381). `setMicrophone` and `micOn` are the call's. A project kept out of sight takes no Space (Codex P1 on #381).
 */
export function usePushToTalk(micOn: boolean, setMicrophone: (on: boolean) => Promise<void>, live: boolean): boolean {
  const scoped = useContext(ShortcutScope)
  const enabled = live && scoped
  const [holding, setHolding] = useState(false)
  const now = useRef({ micOn, holding, setMicrophone })
  useEffect(() => {
    now.current = { micOn, holding, setMicrophone }
  })
  useEffect(() => {
    if (!enabled) return undefined
    const stop = () => {
      if (!now.current.holding) return
      now.current.holding = false
      setHolding(false)
      void now.current.setMicrophone(false)
    }
    const onKey = (phase: 'down' | 'up') => (e: KeyboardEvent) => {
      const key = {
        key: e.key,
        repeat: e.repeat,
        modified: e.shiftKey || e.ctrlKey || e.altKey || e.metaKey,
        fromNowhere: nowhere(e.target),
        modal: modalOnScreen(),
      }
      const act = pushToTalk(phase, key, now.current)
      if (act === null) return
      e.preventDefault()
      if (act === 'start') {
        now.current.holding = true
        setHolding(true)
        // The browser may still be asking when Space is let go, and LiveKit publishes a late enable even after the
        // turn-off stopped waiting for it: a microphone that arrives once Space is up goes off again (Codex P1 on #381).
        void now.current
          .setMicrophone(true)
          .then(() => (now.current.holding ? undefined : now.current.setMicrophone(false)))
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
