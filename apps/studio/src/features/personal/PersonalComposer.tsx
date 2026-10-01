// Writing to Sophia (direction C), in the Studio's message bar: Enter sends, Shift+Enter is a new line, Send waits
// until there is something to send, the draft stays on this device, and the first Escape only lets go of the field (the
// draft stays; the next one goes home). "Talk instead" dictates on the device. One line above the bar says where the
// draft came from or why it is back, as the chat's foot does (.chat-line).
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Icon, Tip } from '@sophia/ui'
import { WRITE_TIMEOUT_MS } from '../../api/client.ts'
import { useMounted } from '../../app/useMounted.ts'
import { useDictation } from './dictation.ts'
import {
  afterSent,
  draftKey,
  draftOf,
  goingOut,
  onOpening,
  readKept,
  restoredDraft,
  writeKept,
  type Draft,
} from './draft.ts'
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
 * The draft a field opens with in `epoch` (onOpening): words on their way a tab left behind come back ahead of it, and
 * the device keeps them so, apart from nothing.
 */
function opened(account: string, epoch: number): { draft: Draft | null; back: boolean; at: number } {
  const kept = readKept(account, epoch)
  const open = onOpening(kept, Date.now())
  const at = open.back ? writeKept(account, { draft: open.draft, sending: null }, epoch) : (kept.at ?? epoch)
  return { ...open, at }
}

/** The line above the field for the draft it opens with. */
const openingNote = (open: { draft: Draft | null; back: boolean }) =>
  open.back ? BACK.unconfirmed : open.draft ? KEPT : ''

/**
 * The field follows the one draft this device keeps, as the space's epoch shows it (readKept): once the epoch is
 * known, another tab's change (a send there, an erasure there) at once; and an erasure anywhere (another device, one
 * whose answer was lost, one while this device was locked) moves the epoch, which takes the words written before it
 * from the field and from this device. Words on their way are never shown here. `adopt` is told the line above the
 * field.
 */
function useDraftFollows(
  account: string,
  epoch: number | undefined,
  adopt: (draft: Draft | null, why: string, at: number, theirs: number | null) => void,
) {
  const follow = useRef(adopt)
  useEffect(() => {
    follow.current = adopt
  })
  // The epoch the field's words were read in (none yet while the space loads: the field shows nothing then).
  const read = useRef(epoch)
  useEffect(() => {
    if (epoch === undefined) return undefined
    if (read.current !== epoch) {
      if (read.current === undefined) {
        const open = opened(account, epoch)
        follow.current(
          open.draft,
          openingNote(open),
          open.at,
          open.back ? null : (readKept(account, epoch).sending?.until ?? null),
        )
      } else {
        const kept = readKept(account, epoch)
        follow.current(kept.draft, '', kept.at ?? epoch, kept.sending?.until ?? null)
      }
      read.current = epoch
    }
    const key = draftKey(account)
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key && e.key !== null) return
      const kept = readKept(account, epoch)
      follow.current(kept.draft, '', kept.at ?? epoch, kept.sending?.until ?? null)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [account, epoch])
}

/**
 * Words another tab has on their way, until `until`: should that tab go away before they are answered, they come back
 * to this field once their time is up (onOpening), said so; `back` is told them and the epoch they are kept in.
 */
function useLeftBehind(
  account: string,
  epoch: number | undefined,
  until: number | null,
  back: (draft: Draft | null, at: number) => void,
) {
  const restore = useRef(back)
  useEffect(() => {
    restore.current = back
  })
  useEffect(() => {
    if (until === null || epoch === undefined) return undefined
    const wake = setTimeout(
      () => {
        const open = onOpening(readKept(account, epoch), Date.now())
        if (open.back) restore.current(open.draft, writeKept(account, { draft: open.draft, sending: null }, epoch))
      },
      Math.max(0, until - Date.now()) + 50,
    )
    return () => clearTimeout(wake)
  }, [account, epoch, until])
}

/** The draft, kept on this device as it is written, and the line above the field that says where it came from. */
function useDraft(account: string, epoch: number | undefined) {
  const [first] = useState(() => (epoch === undefined ? null : opened(account, epoch)))
  const [text, setText] = useState(first?.draft?.text ?? '')
  const [note, setNote] = useState(first ? openingNote(first) : '')
  // The epoch the field's words are kept in: newer than the space's, they were written after an erasure this page
  // hasn't read yet (another tab's).
  const [at, setAt] = useState(first?.at)
  // What the field holds now, with its key, for words that come back after a send that waited (restoredDraft).
  const latest = useRef<Draft | null>(first?.draft ?? null)
  // Words on their way, with their key: the device keeps them apart from the draft until they are sent.
  const sending = useRef<Draft | null>(null)
  const show = (draft: Draft | null, why: string) => {
    latest.current = draft
    setText(draft?.text ?? '')
    setNote(why)
  }
  // Words another tab has on their way (never this tab's own): their time, for useLeftBehind.
  const [theirs, setTheirs] = useState<number | null>(null)
  useDraftFollows(account, epoch, (draft, why, kept, until) => {
    show(draft, why)
    setAt(kept)
    setTheirs(sending.current ? null : until)
  })
  useLeftBehind(account, epoch, theirs, (draft, kept) => {
    show(draft, BACK.unconfirmed)
    setAt(kept)
    setTheirs(null)
  })
  // Kept with the epoch they are written in; none is known while the space loads, and nothing is typed then.
  const keep = (change: (kept: ReturnType<typeof readKept>) => ReturnType<typeof readKept>) => {
    if (epoch === undefined) return null
    const now = change(readKept(account, epoch))
    setAt(writeKept(account, now, epoch))
    return now
  }
  /** Words in the field: the device keeps them as its draft, with what is on its way (any tab's) as it is. */
  const set = (draft: Draft | null, why: string) => {
    show(draft, why)
    keep((kept) => ({ ...kept, draft }))
  }
  return {
    text,
    note,
    at,
    change: (value: string, why = value ? KEPT : '') => set(value ? draftOf(value) : null, why),
    /** The words in the field, with the key they go under. */
    current: () => latest.current,
    /** The words go, under their key: the field empties at once, and the device keeps them apart until they're sent. */
    go: (words: Draft) => {
      sending.current = words
      show(null, '')
      keep((kept) => goingOut(kept, words, Date.now() + WRITE_TIMEOUT_MS))
    },
    /** Sent (or erased with the space): the device lets those words go and keeps its draft as it is then. */
    sent: () => {
      const words = sending.current
      sending.current = null
      const now = words ? keep((kept) => afterSent(kept, words)) : null
      if (now) show(now.draft, '')
    },
    /** Not sent: the words come back to the field, under the key they went with when nothing was typed meanwhile. */
    back: (words: Draft, why: string) => {
      sending.current = null
      const typed = latest.current?.text ?? ''
      const draft = typed.trim() ? draftOf(restoredDraft(words.text, typed)) : words
      show(draft, why)
      keep((kept) => ({ ...afterSent(kept, words), draft }))
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
  /**
   * Sends the words under `key`, the draft's (every tab sends the same draft under the same key), and resolves to how
   * the send went; words that didn't go come back into the field, unless erased with the space.
   */
  onSend: (text: string, key: string) => Promise<SendOutcome>
  onListening: (listening: boolean) => void
  /** The field holds words kept after an erasure this page hasn't read: the space is read again before they go. */
  onBehind: () => void
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
    const current = draft.current()
    const text = current?.text.trim() ?? ''
    if (!current || !text || !ready || busy) return
    const words = { text, key: current.key }
    draft.go(words)
    const outcome = await onSend(text, words.key)
    if (!mounted.current) return
    if (outcome === 'sent' || outcome === 'erased') draft.sent()
    else draft.back(words, BACK[outcome])
  }
}

/** Words kept in an epoch this page's space hasn't reached: it reads the space again, and they wait until it has. */
function useBehind(at: number | undefined, epoch: number | undefined, onBehind: () => void): boolean {
  const behind = at !== undefined && epoch !== undefined && at > epoch
  const read = useRef(onBehind)
  useEffect(() => {
    read.current = onBehind
  })
  useEffect(() => {
    if (behind) read.current()
  }, [behind])
  return behind
}

export function PersonalComposer({ account, epoch, hidden, state, busy, onSend, onListening, onBehind }: Props) {
  const draft = useDraft(account, epoch)
  const behind = useBehind(draft.at, epoch, onBehind)
  const { text, note, change } = draft
  const field = useRef<HTMLTextAreaElement>(null)
  const dictation = useDictation((heard) => {
    change(text ? `${text} ${heard}` : heard, 'From your voice · edit it or send')
    field.current?.focus()
  }, hidden)
  useEffect(() => onListening(dictation.listening), [dictation.listening, onListening])
  const ready = state === 'ready' && !behind
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
