// Writing to Sophia (direction C), in the Studio's message bar: Enter sends, Shift+Enter is a new line, Send waits
// until there is something to send, the draft stays on this device, and the first Escape only lets go of the field (the
// draft stays; the next one goes home). "Talk instead" dictates on the device. One line above the bar says where the
// draft came from or why it is back, as the chat's foot does (.chat-line).
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Icon, Tip } from '@sophia/ui'
import { useMounted } from '../../app/useMounted.ts'
import { useDictation } from './dictation.ts'
import { draftKey, draftToStore, readDraft, restoredDraft, writeDraft } from './draft.ts'
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

/**
 * The field follows the one draft this device keeps, as the space's epoch shows it (readDraft): once the epoch is
 * known, another tab's change (a send there, an erasure there) at once; and an erasure anywhere (another device, one
 * whose answer was lost, one while this device was locked) moves the epoch, which takes the words written before it
 * from the field and from this device. `adopt` is told whether the words are the draft the device kept, read first.
 */
function useDraftFollows(account: string, epoch: number | undefined, adopt: (value: string, first: boolean) => void) {
  const follow = useRef(adopt)
  useEffect(() => {
    follow.current = adopt
  })
  // The epoch the field's words were read in (none yet while the space loads: the field shows nothing then).
  const read = useRef(epoch)
  useEffect(() => {
    if (epoch === undefined) return undefined
    if (read.current !== epoch) {
      follow.current(readDraft(account, epoch), read.current === undefined)
      read.current = epoch
    }
    const key = draftKey(account)
    const onStorage = (e: StorageEvent) => {
      if (e.key === key || e.key === null) follow.current(readDraft(account, epoch), false)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [account, epoch])
}

/** The draft, kept on this device as it is written, and the line above the field that says where it came from. */
function useDraft(account: string, epoch: number | undefined) {
  const [text, setText] = useState(() => (epoch === undefined ? '' : readDraft(account, epoch)))
  const [note, setNote] = useState(() => (text ? KEPT : ''))
  // What the field holds now, for words that come back after a send that waited (restoredDraft).
  const latest = useRef(text)
  // Words on their way: the device keeps them ahead of anything typed meanwhile until they are sent (draftToStore).
  const sending = useRef<string | null>(null)
  useDraftFollows(account, epoch, (value, first) => {
    latest.current = value
    setText(value)
    setNote(first && value ? KEPT : '')
  })
  // Kept with the epoch they are written in; none is known while the space loads, and nothing is typed then.
  const keep = (words: string) => {
    if (epoch !== undefined) writeDraft(account, words, epoch)
  }
  const change = (value: string, why = value ? KEPT : '') => {
    latest.current = value
    setText(value)
    setNote(why)
    keep(draftToStore(sending.current, value))
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
      keep(draftToStore(words, ''))
    },
    /** Sent (or erased with the space): the device keeps only what was typed meanwhile. */
    sent: () => {
      sending.current = null
      keep(latest.current)
    },
    /** Not sent: the words come back to the field (change), which the device then keeps. */
    back: (words: string, why: string) => {
      sending.current = null
      change(restoredDraft(words, latest.current), why)
    },
  }
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
  /** Whose draft this is (accountOf). */
  account: string
  /** The space's epoch as read (undefined until it has loaded): an erasure anywhere moves it. */
  epoch: number | undefined
  /** The space is out of sight (a lock, another place): dictation stops, and a start still waiting is called off. */
  hidden: boolean
  state: ComposerState
  /** A message is on its way, from the field or a way to start: the next waits in the field. */
  busy: boolean
  /** Resolves to how the send went; words that didn't go come back into the field, unless erased with the space. */
  onSend: (text: string) => Promise<SendOutcome>
  onListening: (listening: boolean) => void
}

/**
 * Sending the field's words. Closing the page while they are on their way loses nothing: they come back as the draft.
 * A composer that went meanwhile (signing out, an erasure) takes nothing back: those words went with the rest. One
 * message is on its way at a time, as the device keeps one: while one is (`busy`, also a way to start's), the next
 * waits, and what is typed meanwhile stays.
 */
function useSend(draft: ReturnType<typeof useDraft>, ready: boolean, busy: boolean, onSend: Props['onSend']) {
  const mounted = useMounted()
  return async () => {
    const words = draft.text.trim()
    if (!words || !ready || busy) return
    draft.go(words)
    const outcome = await onSend(words)
    if (!mounted.current) return
    if (outcome === 'sent' || outcome === 'erased') draft.sent()
    else draft.back(words, BACK[outcome])
  }
}

export function PersonalComposer({ account, epoch, hidden, state, busy, onSend, onListening }: Props) {
  const draft = useDraft(account, epoch)
  const { text, note, change } = draft
  const field = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation((heard) => {
    change(text ? `${text} ${heard}` : heard, 'From your voice · edit it or send')
    field.current?.focus()
  }, hidden)
  useEffect(() => onListening(dictation.listening), [dictation.listening, onListening])
  const ready = state === 'ready'
  const send = useSend(draft, ready, busy, onSend)
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
          aria-disabled={busy || undefined}
        >
          <Icon name="send" />
          <Tip label="Send" keys="Enter" side="top" align="end" />
        </button>
      </div>
    </form>
  )
}
