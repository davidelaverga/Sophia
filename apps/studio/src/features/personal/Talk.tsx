// Talking with her (docs/plans/personal-twenty.md): a live talk by voice over the conversation. Her light as Umbral,
// large in the middle, speaking or listening; captions of the last things said, each with its speaker's half; mute and
// End (Esc too). A modal: nothing behind it can be reached. Ending writes what was said into the conversation as turns
// (extras.ts). Shown only once the API gives a voice.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { LightMode } from '../light/engine.ts'
import { SophiaLight } from '../light/SophiaLight.tsx'
import { Who } from './Conversation.tsx'
import type { TalkControl, TalkState, Voice } from './extras.ts'

const FORMED = { from: null }
/** The captions keep the last few lines: a talk is listened to, not read back. */
const SHOWN = 3

const moodOf = (speaking: TalkState['speaking']): LightMode =>
  speaking === 'sophia' ? 'speak' : speaking === 'you' ? 'listen' : 'rest'

const SAYS = { sophia: 'Sophia is speaking', you: 'Listening to you' } as const

/**
 * The talk, started once on arrival and ended on leaving (End, Esc, the space going out of sight). The voice it was
 * given is kept: a new identity on a later render (a clock that ticks) never ends one talk to start another.
 */
function useTalk(voice: Voice) {
  const [state, setState] = useState<TalkState>({ lines: [], speaking: null })
  const control = useRef<TalkControl | null>(null)
  const given = useRef(voice)
  useEffect(() => {
    const talk = given.current.start(setState)
    control.current = talk
    return () => {
      control.current = null
      talk.end()
    }
  }, [])
  return { state, control }
}

/** Where Tab goes inside the talk: round its buttons, back in from anywhere else; null to let Tab move as it does. */
function tabTarget(box: HTMLElement | null, back: boolean): HTMLElement | null {
  const buttons = [...(box?.querySelectorAll<HTMLElement>('button') ?? [])]
  const [first, last] = [buttons[0] ?? null, buttons.at(-1) ?? null]
  const at = document.activeElement
  if (!(at instanceof Node && box?.contains(at))) return first
  if (back) return at === first ? last : null
  return at === last ? first : null
}

/**
 * The talk is a modal: Esc ends it wherever the focus is, even on its ground (the places' own Esc never sees it), and
 * Tab goes round its own buttons, never to the page behind it.
 */
function useModalKeys(box: RefObject<HTMLElement | null>, onEnd: () => void) {
  const end = useRef(onEnd)
  end.current = onEnd
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        end.current()
        return
      }
      const next = e.key === 'Tab' ? tabTarget(box.current, e.shiftKey) : null
      if (!next) return
      e.preventDefault()
      next.focus()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [box])
}

export function Talk({ voice, onEnd }: { voice: Voice; onEnd: () => void }) {
  const { state, control } = useTalk(voice)
  const [muted, setMuted] = useState(false)
  const end = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLElement>(null)
  useEffect(() => end.current?.focus({ preventScroll: true }), [])
  useModalKeys(box, onEnd)
  // Over the whole screen, the places' bar included: placed at their root, nothing behind it can be pressed.
  const host = document.querySelector('.places')
  const view = (
    <section ref={box} className="c3-talk" role="dialog" aria-modal="true" aria-label="Talking with Sophia">
      <div className="c3-talk-light" aria-hidden>
        <SophiaLight mode={moodOf(state.speaking)} target={null} attention={null} working={false} formed={FORMED} />
      </div>
      <p className="c3-talk-who" role="status">
        {state.speaking ? SAYS[state.speaking] : ''}
      </p>
      <ol className="c3-talk-lines" aria-label="What was said">
        {state.lines.slice(-SHOWN).map((line, i) => (
          <li key={Math.max(0, state.lines.length - SHOWN) + i} data-who={line.who}>
            <Who who={line.who} />
            <span className="sr-only">{line.who === 'you' ? 'You' : 'Sophia'}: </span>
            {line.text}
          </li>
        ))}
      </ol>
      <div className="c3-talk-acts">
        <button
          className="ghost"
          type="button"
          aria-pressed={muted}
          onClick={() => {
            control.current?.mute(!muted)
            setMuted(!muted)
          }}
        >
          Mute
        </button>
        <button ref={end} className="pill primary" type="button" onClick={onEnd}>
          End
        </button>
      </div>
    </section>
  )
  return host ? createPortal(view, host) : view
}
