// Writing to Sophia (direction C), in the Studio's message bar: Enter sends, Shift+Enter is a new line, Send waits
// until there is something to send, the draft stays on this device, and the first Escape only lets go of the field (the
// draft stays; the next one goes home). "Talk instead" dictates on the device. One line above the bar says where the
// draft came from or why it is back, as the chat's foot does (.chat-line).
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Icon, Tip } from '@sophia/ui'
import { useDictation } from './dictation.ts'

const draftKey = (identity: string) => `sophia.personal.draft.v1.${identity}`

function readDraft(identity: string): string {
  try {
    return localStorage.getItem(draftKey(identity)) ?? ''
  } catch {
    return ''
  }
}

function writeDraft(identity: string, text: string): void {
  try {
    if (text) localStorage.setItem(draftKey(identity), text)
    else localStorage.removeItem(draftKey(identity))
  } catch {
    // storage unavailable: the draft lasts for this page only
  }
}

const KEPT = 'Draft kept on this device'

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
  const change = (value: string, why = value ? KEPT : '') => {
    setText(value)
    setNote(why)
    writeDraft(identity, value)
  }
  return { text, note, change }
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
  state: ComposerState
  /** Resolves to whether the words were sent; if not, they go back into the field. */
  onSend: (text: string) => Promise<boolean>
  onListening: (listening: boolean) => void
}

export function PersonalComposer({ identity, state, onSend, onListening }: Props) {
  const { text, note, change } = useDraft(identity)
  const field = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation((heard) => {
    change(text ? `${text} ${heard}` : heard, 'From your voice · edit it or send')
    field.current?.focus()
  })
  useEffect(() => onListening(dictation.listening), [dictation.listening, onListening])
  const ready = state === 'ready'
  const send = async () => {
    const words = text.trim()
    if (!words || !ready) return
    change('')
    if (!(await onSend(words))) change(words, 'Not sent: it’s back in the field')
  }
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
        <button type="submit" className="send has-tip" aria-label="Send" disabled={!ready || !text.trim()}>
          <Icon name="send" />
          <Tip label="Send" keys="Enter" side="top" align="end" />
        </button>
      </div>
    </form>
  )
}
