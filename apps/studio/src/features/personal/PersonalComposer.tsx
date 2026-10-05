// Writing to Sophia (direction C), in the Studio's message bar: Enter sends, Shift+Enter is a new line, Send waits
// until there is something to send, the draft stays on this device, and the first Escape only lets go of the field (the
// draft stays; the next one goes home). "Talk instead" dictates on the device. One line above the bar says where the
// draft came from or why it is back, as the chat's foot does (.chat-line).
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Icon, Tip } from '@sophia/ui'
import { WRITE_TIMEOUT_MS } from '../../api/client.ts'
import { useMounted } from '../../app/useMounted.ts'
import { useDictation } from './dictation.ts'
import { focusLater } from './focus.ts'
import { handing, type Handed } from './handed.ts'
import { NOTICE } from './notice-view.ts'
import { useOnline } from './online.ts'
import {
  afterSent,
  draftKey,
  draftOf,
  goingOut,
  oneAtATime,
  onOpening,
  readKept,
  restoredDraft,
  sendingNow,
  waitsFor,
  writeKept,
  type Draft,
} from './draft.ts'
import type { Unsent } from './write-words.ts'

const KEPT = 'Draft kept on this device'
/** How often a field looks again at words on their way whose tab still sends them. */
const LOOK_AGAIN_MS = 5_000

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
/** At night (lightOf), a field that can take words asks gently. */
const NIGHT = 'Still up? Write to Sophia…'
/** Offline, the words wait in the field: said over its line and in it, before anything is sent. */
const OFFLINE = 'You’re offline. Your words wait here.'

/** What the field says while empty: offline first, then the night, else its state's words. */
function placeholderFor(state: ComposerState, online: boolean, night: boolean): string {
  if (state !== 'ready') return PLACEHOLDER[state]
  if (!online) return OFFLINE
  return night ? NIGHT : PLACEHOLDER.ready
}

/**
 * The draft a field opens with in `epoch` (onOpening): words on their way a tab left behind come back ahead of it, and
 * the device keeps them so, apart from nothing.
 */
function opened(account: string, epoch: number): { draft: Draft | null; back: boolean; at: number } {
  // Words another tab left on their way come back only once it is known that tab no longer sends them (useLeftBehind).
  const kept = readKept(account, epoch)
  return { draft: kept.draft, back: false, at: kept.at ?? epoch }
}

/**
 * Whether `words` wait: another tab holds the device's send (`taken`), or its words are on their way (waitsFor); if so,
 * the line above the field says so.
 */
function waiting(account: string, epoch: number | undefined, words: Draft, say: (why: string) => void, taken: boolean) {
  const wait = taken || (epoch !== undefined && waitsFor(readKept(account, epoch), words, Date.now()))
  if (wait) say(NOTICE.waits)
  return wait
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
    let wake: ReturnType<typeof setTimeout> | undefined
    let done = false
    const look = async () => {
      // Their tab still sends them (it holds the device's send): they stay its own; look again in a while.
      const theirs = await sendingNow(account)
      if (done) return
      if (theirs) {
        wake = setTimeout(() => void look(), LOOK_AGAIN_MS)
        return
      }
      const open = onOpening(readKept(account, epoch), Date.now())
      if (open.back) restore.current(open.draft, writeKept(account, { draft: open.draft, sending: null }, epoch))
    }
    wake = setTimeout(() => void look(), Math.max(0, until - Date.now()) + 50)
    return () => {
      done = true
      clearTimeout(wake)
    }
  }, [account, epoch, until])
}

/**
 * The field follows the draft the device keeps (useDraftFollows), and takes back words another tab left on their way
 * once their time is up (useLeftBehind). `sending`: this tab's own words on their way, never another tab's.
 */
function useFollowsDevice(
  account: string,
  epoch: number | undefined,
  sending: RefObject<Draft | null>,
  show: (draft: Draft | null, why: string) => void,
  setAt: (at: number) => void,
) {
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
  useFollowsDevice(account, epoch, sending, show, setAt)
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
    /** Another tab's message is on its way: these words wait in the field, said so (waiting). */
    waits: (words: Draft, taken: boolean) => waiting(account, epoch, words, setNote, taken),
    /**
     * The words go, under their key: the field empties at once (when they were its words), and the device keeps them
     * apart until they're sent.
     */
    go: (words: Draft, field: boolean) => {
      sending.current = words
      if (field) show(null, '')
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
  placeholder: string
  /** The count shows beside the field (Count): the field names it in its description. */
  counted: boolean
  onChange: (text: string) => void
  onSend: () => void
}

/** The most one message holds; its count shows from NEAR on, so the limit is said before it bites. */
const MOST = 4000
const NEAR = 3600

/**
 * How full the field is, once it nears the most one message holds: at the most, why it takes no more; past it (words
 * heard or handed can go past), by how much.
 */
function Count({ length }: { length: number }) {
  const over = length - MOST
  return (
    <span id="c-count" className={`c3-count${over >= 0 ? ' full' : ''}`}>
      {length.toLocaleString('en-US')} / {MOST.toLocaleString('en-US')}
      {over > 0 ? ` · ${String(over)} over` : over === 0 && ' · the most one message holds'}
    </span>
  )
}

/** Over the field's line: its note (a draft kept, the voice) and, near the most it holds, its count. */
function Over({ note, count }: { note: React.ReactNode; count: number | null }) {
  if (!note && count === null) return null
  return (
    <div className="c3-over">
      {note && (
        <p className="chat-line" role="status">
          {note}
        </p>
      )}
      {count !== null && <Count length={count} />}
    </div>
  )
}

function Field({ field, text, state, placeholder, counted, onChange, onSend }: FieldProps) {
  return (
    <textarea
      ref={field}
      id="c-input"
      aria-describedby={counted ? 'c-private-note c-count' : 'c-private-note'}
      // Stray typing lands here while it can take it (shortcuts.ts): a message begun with the focus nowhere is a
      // message, never a place's key (its first L would lock the space).
      data-typing-sink={state === 'ready' ? '' : undefined}
      rows={1}
      maxLength={MOST}
      placeholder={placeholder}
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
  /** It is night where the person is (lightOf): the field asks gently. */
  night?: boolean
  /** The space's epoch as read (undefined until it has loaded): an erasure anywhere moves it. */
  epoch: number | undefined
  /** The field is out of sight (a lock, another place, a talk over it): dictation stops, and a start still waiting is
   * called off. */
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
  /** A way to start pressed in the conversation goes through this composer's send (set here). */
  starter: RefObject<((words: string) => Promise<boolean>) | null>
  /** Words said to Sophia from Home, handed here to go as this composer's own (Welcome.tsx); taken once. */
  handed: Handed | null
  onHanded: () => void
}

/**
 * Words handed from Home go as the field's would: one at a time, under their own key, kept on their way, and back in
 * the field if they don't go. While the space can't take them yet (still loading, Sophia unavailable, an erasure to
 * read first), they wait in the field, said, for the person to send (handed.ts).
 */
function useHanded(
  p: Props,
  ready: boolean,
  send: (given?: Draft) => Promise<boolean>,
  draft: ReturnType<typeof useDraft>,
) {
  const taken = useRef(0)
  const { handed, onHanded, busy } = p
  useEffect(() => {
    const what = handing(handed, taken.current, ready, busy)
    if (!handed || what === 'none' || what === 'wait') return
    taken.current = handed.id
    onHanded()
    if (what === 'send') void send(draftOf(handed.words))
    else draft.change(draft.text ? `${draft.text} ${handed.words}` : handed.words, HANDED)
  })
}

const HANDED = 'From Home · send it when Sophia is ready'

/**
 * Sending the field's words. Closing the page while they are on their way loses nothing: they come back as the draft.
 * A composer that went meanwhile (signing out, an erasure) takes nothing back: those words went with the rest. One
 * message is on its way at a time, as the device keeps one: while one is (`busy`, also a way to start's), the next
 * waits, and what is typed meanwhile stays.
 */
function useSend(
  account: string,
  draft: ReturnType<typeof useDraft>,
  ready: boolean,
  busy: boolean,
  onSend: Props['onSend'],
) {
  const mounted = useMounted()
  /**
   * `given`: a way to start's words, which go as the field's do and leave the field as it is; else the field's.
   * Resolves once it is known whether they went on their way: not while another message is (here or in another tab),
   * so what waits on them (her look back at the week) stays until they do.
   */
  return (given?: Draft): Promise<boolean> => {
    const current = given ?? draft.current()
    const text = current?.text.trim() ?? ''
    // Past the most one message holds (words heard or handed), nothing goes: the count says how much over.
    if (!current || !text || text.length > MOST || !ready || busy) return Promise.resolve(false)
    const words = { text, key: current.key }
    const { promise: admitted, resolve: admit } = Promise.withResolvers<boolean>()
    void oneAtATime(account, async (taken) => {
      const waits = draft.waits(words, taken)
      admit(!waits)
      if (waits) return
      draft.go(words, !given)
      // This tab holds the device's send until they settle: another tab takes them back only if this one went away.
      const outcome = await onSend(text, words.key)
      // Sent (or erased): the device lets them go, also when the field went meanwhile (the padlock shut).
      if (outcome === 'sent' || outcome === 'erased') draft.sent()
      else if (mounted.current) draft.back(words, BACK[outcome])
    }).finally(() => admit(false)) // a send that failed before its admission was decided didn't go
    return admitted
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

/**
 * What the voice heard goes into the field, and the focus with it once the field is back on screen (it gives way to
 * the listening line): unless the person moved on while it listened (focusLater, taken as the listening starts).
 */
function useVoice(draft: ReturnType<typeof useDraft>, field: RefObject<HTMLTextAreaElement | null>, hidden: boolean) {
  const land = useRef<(el: HTMLElement | null) => void>(() => undefined)
  const landing = useRef<((el: HTMLElement | null) => void) | null>(null)
  const dictation = useDictation((heard) => {
    draft.change(draft.text ? `${draft.text} ${heard}` : heard, 'From your voice · edit it or send')
    landing.current = land.current
  }, hidden)
  useLayoutEffect(() => {
    if (dictation.listening || !landing.current) return
    landing.current(field.current)
    landing.current = null
  }, [dictation.listening, field])
  const start = () => {
    land.current = focusLater()
    dictation.start()
  }
  return { ...dictation, start }
}

/**
 * Where a way to start sends its words: through the field's send, one at a time, its own key, kept on its way, the
 * field left as it is. It resolves to whether they went on their way: while another message is (here or in another
 * tab), or Sophia can't take them yet, they don't. Offline (`waits`), they go into the field to wait instead, as the
 * field's own words do, and that counts as gone: a press is never lost.
 */
function useStarter(
  starter: Props['starter'],
  free: boolean,
  send: (given?: Draft) => Promise<boolean>,
  waits: ((words: string) => void) | null,
) {
  useEffect(() => {
    starter.current = (words: string) => {
      if (waits) {
        waits(words)
        return Promise.resolve(true)
      }
      return free ? send(draftOf(words)) : Promise.resolve(false)
    }
  })
}

/** Words added to the field after what is written there, never over it. */
function addWords(draft: ReturnType<typeof useDraft>, words: string, why: string): void {
  const typed = draft.current()?.text ?? ''
  draft.change(typed ? `${typed} ${words}` : words, why)
}

/** Offline, nothing goes: whether words can go, and whether they wait (they could go, but the browser is offline). */
function useWaiting(state: ComposerState, behind: boolean) {
  const online = useOnline()
  const could = state === 'ready' && !behind
  return { online, ready: could && online, waiting: could && !online }
}

interface BarProps {
  field: RefObject<HTMLTextAreaElement | null>
  text: string
  state: ComposerState
  counted: boolean
  placeholder: string
  ready: boolean
  busy: boolean
  dictation: ReturnType<typeof useVoice>
  onChange: (text: string) => void
  onSend: () => void
}

/** The message bar: her padlock, the field (or the voice listening), the microphone and Send. */
function Bar({ field, text, state, counted, placeholder, ready, busy, dictation, onChange, onSend }: BarProps) {
  return (
    <div className={`message-bar${dictation.listening ? ' listening' : ''}`}>
      <span className="c3-private" title="Only she hears this" aria-hidden>
        <Icon name="lock" />
      </span>
      <label className="sr-only" htmlFor="c-input">
        Message Sophia
      </label>
      <span id="c-private-note" className="sr-only">
        Only she hears this
      </span>
      <Field {...{ field, text, state, counted, placeholder, onChange, onSend }} />
      {dictation.listening && <Listening />}
      {/* A microphone listening keeps its Stop whatever else changed (offline, a send on its way). */}
      {dictation.available && (ready || dictation.listening) && (
        <MicButton
          listening={dictation.listening}
          onPress={() => (dictation.listening ? dictation.stop() : dictation.start())}
        />
      )}
      <button
        type="submit"
        className="send has-tip"
        aria-label="Send"
        disabled={!ready || !text.trim() || text.length > MOST}
        aria-disabled={busy || undefined}
      >
        <Icon name="send" />
        <Tip label="Send" keys="Enter" side="top" align="end" />
      </button>
    </div>
  )
}

export function PersonalComposer(props: Props) {
  const { account, epoch, hidden, state, busy, onSend, onListening, onBehind, starter } = props
  const draft = useDraft(account, epoch)
  const behind = useBehind(draft.at, epoch, onBehind)
  const { text, note, change } = draft
  const field = useRef<HTMLTextAreaElement>(null)
  const dictation = useVoice(draft, field, hidden)
  useEffect(() => onListening(dictation.listening), [dictation.listening, onListening])
  const { online, ready, waiting: offline } = useWaiting(state, behind)
  const send = useSend(account, draft, ready, busy, onSend)
  useHanded(props, ready, send, draft)
  useStarter(starter, ready && !busy, send, offline ? (words) => addWords(draft, words, OFFLINE) : null)
  const counted = text.length >= NEAR && !dictation.listening
  return (
    <form
      className="ps-composer"
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
    >
      <Over note={offline ? OFFLINE : note} count={counted ? text.length : null} />
      <Bar
        {...{ field, text, state, counted, ready, busy, dictation }}
        placeholder={placeholderFor(state, online, !!props.night)}
        onChange={change}
        onSend={() => void send()}
      />
    </form>
  )
}
