// Writing to Sophia (direction C), in the Studio's message bar: Enter sends, Shift+Enter is a new line, Send waits
// until there is something to send, the draft stays on this device, and the first Escape only lets go of the field (the
// draft stays; the next one goes home). "Talk instead" dictates on the device. One line above the bar says where the
// draft came from or why it is back, as the chat's foot does (.chat-line).
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Icon, Tip } from '@sophia/ui'
import { useDictation } from './dictation.ts'
import { draftToStore, readDraft, restoredDraft, writeDraft } from './draft.ts'
import type { Unsent } from './write-words.ts'

const KEPT = 'Draft kept on this device'

/** Why words are back in the field: they weren't sent, or no answer came back (they may have been). */
const BACK: Record<Exclude<Unsent, 'erased'>, string> = {
  unsent: 'Not sent: it’s back in the field',
  unconfirmed: 'Not confirmed: check the conversation before sending again',
}

/** How a send went: sent, or why not (unsent, in write-words.ts). */
export type SendOutcome = 'sent' | Unsent

/** Until the space has loaded nothing is sent; without a companion the field says Sophia can't answer here. */
type ComposerState = 'loading' | 'ready' | 'unavailable'

const PLACEHOLDER: Record<ComposerState, string> = {
  loading: 'Write to Sophia…',
  ready: 'Write to Sophia…',
  unavailable: 'Sophia can’t answer here yet',
}

/** The draft, kept on this device as it is written, and the line above the field that says where it came from. */
function useDraft(identity: string) {
  const [text, setText] = useState(() => readDraft(identity))
  const [note, setNote] = useState(() => (readDraft(identity) ? KEPT : ''))
  // What the field holds now, for words that come back after a send that waited (restoredDraft).
  const latest = useRef(text)
  // Words on their way: the device keeps them ahead of anything typed meanwhile until they are sent (draftToStore).
  const sending = useRef<string | null>(null)
  const change = (value: string, why = value ? KEPT : '') => {
    latest.current = value
    setText(value)
    setNote(why)
    writeDraft(identity, draftToStore(sending.current, value))
  }
  return {
    text,
    note,
    change,
    current: () => latest.current,
    /** The words go: the field empties at once, and the device keeps them until they're sent. */
    go: (words: string) => {
      sending.current = words
      latest.current = ''
      setText('')
      setNote('')
      writeDraft(identity, draftToStore(words, ''))
    },
    /** Sent (or erased with the space): the device keeps only what was typed meanwhile. */
    sent: () => {
      sending.current = null
      writeDraft(identity, latest.current)
    },
    /** Not sent: the words come back to the field (change), which the device then keeps. */
    back: (words: string, why: string) => {
      sending.current = null
      change(restoredDraft(words, latest.current), why)
    },
  }
}

/** Whether this composer is still on the page (false once it went: signing out, an erasure). */
function useMounted() {
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}

function Listening() {
  return (
    <div className="c3-listen">
      <span className="c3-wave" aria-hidden>
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>Listening…</span>
    </div>
  )
}

function MicButton({ listening, onPress }: { listening: boolean; onPress: () => void }) {
  return (
    <button
      className="round has-tip"
      type="button"
      aria-pressed={listening}
      aria-label={listening ? 'Stop listening' : 'Talk instead'}
      onClick={onPress}
    >
      <Icon name={listening ? 'stop' : 'mic'} />
      <Tip label="Talk instead. Your voice stays on this device." side="top" align="end" />
    </button>
  )
}

interface FieldProps {
  field: RefObject<HTMLTextAreaElement | null>
  text: string
  state: ComposerState
  onChange: (text: string) => void
  onSend: () => void
}

function Field({ field, text, state, onChange, onSend }: FieldProps) {
  return (
    <textarea
      ref={field}
      id="c-input"
      // Stray typing lands here while it can take it (shortcuts.ts): a message begun with the focus nowhere is a
      // message, never a place's key (its first L would lock the space).
      data-typing-sink={state === 'ready' ? '' : undefined}
      rows={1}
      maxLength={4000}
      placeholder={PLACEHOLDER[state]}
      value={text}
      disabled={state !== 'ready'}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault()
          onSend()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          e.currentTarget.blur()
        }
      }}
    />
  )
}

interface Props {
  identity: string
  /** The space is out of sight (a lock, another place): dictation stops. */
  hidden: boolean
  state: ComposerState
  /** Resolves to how the send went; words that didn't go come back into the field, unless erased with the space. */
  onSend: (text: string) => Promise<SendOutcome>
  onListening: (listening: boolean) => void
}

/**
 * Sending the field's words. Closing the page while they are on their way loses nothing: they come back as the draft.
 * A composer that went meanwhile (signing out, an erasure) takes nothing back: those words went with the rest. One
 * message is on its way at a time, as the device keeps one: the next waits, and what is typed meanwhile stays.
 */
function useSend(draft: ReturnType<typeof useDraft>, ready: boolean, onSend: Props['onSend']) {
  const mounted = useMounted()
  const [sending, setSending] = useState(false)
  const send = async () => {
    const words = draft.text.trim()
    if (!words || !ready || sending) return
    setSending(true)
    draft.go(words)
    const outcome = await onSend(words)
    if (!mounted.current) return
    setSending(false)
    if (outcome === 'sent' || outcome === 'erased') draft.sent()
    else draft.back(words, BACK[outcome])
  }
  return { sending, send }
}

export function PersonalComposer({ identity, hidden, state, onSend, onListening }: Props) {
  const draft = useDraft(identity)
  const { text, note, change } = draft
  const field = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation((heard) => {
    change(text ? `${text} ${heard}` : heard, 'From your voice · edit it or send')
    field.current?.focus()
  })
  useEffect(() => onListening(dictation.listening), [dictation.listening, onListening])
  const { listening, stop } = dictation
  useEffect(() => {
    if (hidden && listening) stop()
  }, [hidden, listening, stop])
  const ready = state === 'ready'
  const { sending, send } = useSend(draft, ready, onSend)
  return (
    <form
      className="ps-composer"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      {note && (
        <p className="chat-line" role="status">
          {note}
        </p>
      )}
      <div className={`message-bar${dictation.listening ? ' listening' : ''}`}>
        <label className="sr-only" htmlFor="c-input">
          Message Sophia
        </label>
        <Field field={field} text={text} state={state} onChange={change} onSend={() => void send()} />
        {dictation.listening && <Listening />}
        {dictation.available && ready && (
          <MicButton
            listening={dictation.listening}
            onPress={() => (dictation.listening ? dictation.stop() : dictation.start())}
          />
        )}
        <button
          type="submit"
          className="send has-tip"
          aria-label="Send"
          disabled={!ready || !text.trim()}
          aria-disabled={sending || undefined}
        >
          <Icon name="send" />
          <Tip label="Send" keys="Enter" side="top" align="end" />
        </button>
      </div>
    </form>
  )
}
