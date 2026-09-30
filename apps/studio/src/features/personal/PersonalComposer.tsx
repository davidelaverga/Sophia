// Writing to Sophia (direction C): Enter sends, Shift+Enter is a new line, the draft stays on this device, and the first
// Escape only lets go of the field (the draft stays; the next one goes home). "Talk instead" dictates on the device.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Tip } from '@sophia/ui'
import { useDictation } from './dictation.ts'
import { Mic, Stop } from './icons.tsx'

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

/** The field grows with what is written, up to a limit, then scrolls; no scrollbar until then. */
function fit(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(140, el.scrollHeight)}px`
  el.style.overflowY = el.scrollHeight > 140 ? 'auto' : 'hidden'
}

const KEPT = 'Draft kept on this device'

/** The draft, kept on this device as it is written, and the line under the field that says where it came from. */
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
      className="btn ghost icon-btn c3-mic has-tip"
      type="button"
      aria-pressed={listening}
      aria-label={listening ? 'Stop listening' : 'Talk instead'}
      onClick={onPress}
    >
      {listening ? <Stop /> : <Mic />}
      <Tip label="Talk instead. Your voice stays on this device." side="bottom" align="end" />
    </button>
  )
}

interface FieldProps {
  field: RefObject<HTMLTextAreaElement | null>
  text: string
  canSend: boolean
  onChange: (text: string) => void
  onSend: () => void
}

function Field({ field, text, canSend, onChange, onSend }: FieldProps) {
  return (
    <textarea
      ref={field}
      id="c-input"
      rows={1}
      placeholder={canSend ? 'Write to Sophia…' : 'Sophia can’t answer here yet'}
      value={text}
      disabled={!canSend}
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
  /** False while Sophia can't answer here (no companion): the field says so instead of sending into nothing. */
  canSend: boolean
  /** Resolves to whether the words were sent; if not, they go back into the field. */
  onSend: (text: string) => Promise<boolean>
  onListening: (listening: boolean) => void
}

export function PersonalComposer({ identity, canSend, onSend, onListening }: Props) {
  const { text, note, change } = useDraft(identity)
  const field = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation((heard) => {
    change(text ? `${text} ${heard}` : heard, 'From your voice · edit it or send')
    field.current?.focus()
  })
  useEffect(() => fit(field.current), [text])
  useEffect(() => onListening(dictation.listening), [dictation.listening, onListening])
  const send = async () => {
    const words = text.trim()
    if (!words || !canSend) return
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
      <div className={`compose-box${dictation.listening ? ' listening' : ''}`}>
        <label className="sr-only" htmlFor="c-input">
          Message Sophia
        </label>
        <Field field={field} text={text} canSend={canSend} onChange={change} onSend={() => void send()} />
        {dictation.listening && <Listening />}
        {dictation.available && canSend && (
          <MicButton
            listening={dictation.listening}
            onPress={() => (dictation.listening ? dictation.stop() : dictation.start())}
          />
        )}
        <button className="btn primary" type="submit" disabled={!canSend}>
          Send
        </button>
      </div>
      <div className="hint">
        <span>
          <kbd>↵</kbd> send
        </span>
        <span>{note}</span>
      </div>
    </form>
  )
}
