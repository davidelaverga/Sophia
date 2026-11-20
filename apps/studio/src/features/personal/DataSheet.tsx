// "Your data" (direction C), in the Studio's sheet (app/Sheet.tsx): what the personal space keeps, counted; everything
// as text to copy; and deleting it all, with a typed confirmation for the one thing that can't be undone. Behind the
// padlock it shows nothing of the space, not even the counts, until the person confirms it's them.
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  controlledPinned,
  exportControlledSpace,
  exportPersonalSpace,
  isControlled,
  type SpaceRead,
} from '../../api/personal.ts'
import { accountOf, tokenSubject } from '../../app/auth-callback.ts'
import { Sheet } from '../../app/Sheet.tsx'
import type { ShowToast } from '../../app/Toast.tsx'
import { useMounted } from '../../app/useMounted.ts'
import {
  browserClip,
  copyFetched,
  CopyCalledOff,
  CopyStillWriting,
  CopyUnconfirmed,
  eraseAfterWrites,
  forgetAnswered,
} from './copy.ts'
import { confirmsErasure, DATA, exportText, factsOf, factWords } from './data-view.ts'
import { focusSoon } from './focus.ts'
import { erasureRefused, NOTICE } from './notice-view.ts'
import { ReadNotes, type Read } from './ReadNotes.tsx'
import { personalFailure } from './write-words.ts'
import { stillSignedIn } from '../../app/signed-in.ts'
import { readControlledAfterRefusal } from './usePersonal.ts'

interface Props {
  /** The identity’s personal-query cache key, never its display name. */
  name: string
  token: string
  who: string
  space: SpaceRead | undefined
  /** How the space's read stands: a slow or failed one is said here too, with Try again (never bare dashes). */
  read: Read
  /** The space's epoch as this page knows it (epochNow): a copy is read against it, and an erasure moves it. */
  epoch: number
  locked: boolean
  /** The padlock as stored this moment (useLock): a copy reads it when its export arrives. */
  lockedNow: () => boolean
  toast: ShowToast
  onClose: () => void
  /** Where the focus goes on closing when what opened the sheet is gone (a project's account menu). */
  returnTo: () => HTMLElement | null
  onUnlock: () => void
  onErase: () => Promise<unknown>
}

function Facts({ space }: { space: SpaceRead | undefined }) {
  const facts = space ? factsOf(space) : null
  const words = factWords(facts ?? { days: 0, notes: 0, carried: 0 })
  return (
    <div className="facts">
      <div className="fact">
        <b>{facts?.days ?? '–'}</b>
        <span>{words.days}</span>
      </div>
      <div className="fact">
        <b>{facts?.notes ?? '–'}</b>
        <span>{words.notes}</span>
      </div>
      <div className="fact">
        <b>{facts?.carried ?? '–'}</b>
        <span>{words.carried}</span>
      </div>
    </div>
  )
}

function Erase({ onErase }: { onErase: () => Promise<void> }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <div className="danger-zone">
      <strong>{DATA.erase}</strong>
      <p>{DATA.eraseSays}</p>
      <label className="field-label" htmlFor="c-del">
        {DATA.confirm}
      </label>
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault()
          if (busy) return
          setBusy(true)
          void onErase().finally(() => setBusy(false))
        }}
      >
        <input id="c-del" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button
          className="pill danger"
          type="submit"
          // Deleting keeps the focus on the button (aria-disabled); without the word it isn't a press yet (disabled).
          disabled={!busy && !confirmsErasure(typed)}
          aria-disabled={busy || undefined}
        >
          {busy ? 'Deleting…' : 'Delete everything'}
        </button>
      </form>
    </div>
  )
}

interface BodyProps {
  space: SpaceRead | undefined
  read: Read
  locked: boolean
  onUnlock: () => void
  onCopy: () => void
  /** A copy is under way: the press waits for it ("Copying…"), and starts no other. */
  copying: boolean
  /** An erasure is under way: no copy starts (it would read what is being erased). */
  erasing: boolean
  onErase: () => Promise<void>
}

function DataBody({ space, read, locked, onUnlock, onCopy, copying, erasing, onErase }: BodyProps) {
  if (locked) {
    return (
      <>
        <p className="muted">{DATA.locked}</p>
        <button id="c-data-unlock" className="pill" type="button" onClick={onUnlock}>
          {DATA.unlock}
        </button>
      </>
    )
  }
  return (
    <>
      <ReadNotes reads={[read]} />
      <Facts space={space} />
      <button
        id="c-data-copy"
        className="pill"
        type="button"
        aria-disabled={copying || erasing || undefined}
        onClick={onCopy}
      >
        {copying ? DATA.copying : DATA.copy}
      </button>
      <Erase onErase={onErase} />
    </>
  )
}

/**
 * The padlock shut or opened from elsewhere (another tab, a call) swaps the body while the sheet is open: a focus that
 * went with the old body goes to the new one's first control.
 */
function useSwapFocus(locked: boolean) {
  const was = useRef(locked)
  useEffect(() => {
    if (was.current === locked) return
    was.current = locked
    requestAnimationFrame(() => {
      if (document.activeElement && document.activeElement !== document.body) return
      document.getElementById(locked ? 'c-data-unlock' : 'c-data-copy')?.focus()
    })
  }, [locked])
}

/**
 * A signal for each copy's export, aborted (CopyCalledOff) once the padlock shuts, the sheet goes or the space is erased
 * (here: `all`, as the erasure begins; anywhere: the epoch moves): the export then stops at once, asks for no page more
 * and lets what came go. No export starts while the padlock is shut, so any change of it calls off every one on its way.
 */
function useCalledOff(locked: boolean, epoch: number, account: string) {
  const exports = useRef(new Set<AbortController>())
  const all = () => {
    for (const one of exports.current) one.abort(new CopyCalledOff('The padlock shut, the sheet went, or an erasure'))
    exports.current.clear()
  }
  const callOff = useRef(all)
  useEffect(() => {
    callOff.current = all
  })
  useEffect(() => () => callOff.current(), [locked, epoch, account])
  return {
    all,
    done: (one: AbortController) => exports.current.delete(one),
    start: () => {
      const one = new AbortController()
      exports.current.add(one)
      return one
    },
  }
}

type CalledOff = ReturnType<typeof useCalledOff>

/** The clipboard's one promise stops waiting for a refresh as soon as its own gesture is called off. */
async function untilCopyCalledOff<T>(reading: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  let stop: (() => void) | undefined
  const calledOff = new Promise<never>((_resolve, reject) => {
    stop = () => reject(new CopyCalledOff('The copy was called off'))
    signal.addEventListener('abort', stop, { once: true })
  })
  try {
    return await Promise.race([reading, calledOff])
  } finally {
    if (stop) signal.removeEventListener('abort', stop)
  }
}

/** A legacy refusal discards that whole export; this same, still-current gesture then starts A54 at zero. */
async function readCopyExport(props: Props, client: QueryClient, signal: AbortSignal, kept: () => boolean) {
  signal.throwIfAborted()
  if (!kept()) throw new CopyCalledOff('The copy is no longer current')
  const controlled = controlledPinned(client, props.name) || (props.space && isControlled(props.space))
  const read = controlled ? exportControlledSpace : exportPersonalSpace
  try {
    return await read(props.token, props.epoch, signal)
  } catch (err: unknown) {
    if (controlled) throw err
    signal.throwIfAborted()
    if (!kept()) throw new CopyCalledOff('The copy is no longer current')
    const changed = await untilCopyCalledOff(readControlledAfterRefusal(client, props.name, err, signal), signal)
    if (!changed) throw err
    signal.throwIfAborted()
    const current = client.getQueryData<SpaceRead>(['personal', props.name])
    if (!kept() || current?.epoch !== props.epoch) throw new CopyCalledOff('The copy’s epoch changed')
    return exportControlledSpace(props.token, props.epoch, signal)
  }
}

/**
 * Copying everything as text, one copy at a time: a press while one is under way waits ("Copying…") and starts no
 * other. The press waits no longer than the browser's wait (copy.ts): a write it hasn't answered then is said
 * unconfirmed. From its press until the browser answers it (and any emptying it led to), whether this sheet is still
 * open or not, no other Personal copy starts and no erasure (copy.ts's `stillWriting`, `eraseAfterWrites`).
 * A copy whose export arrives once the padlock is shut (as stored then, wherever it was shut) or the sheet has gone
 * (closed, signing out) copies nothing; one still on its way then stops at once, and so does one when the space is
 * erased (here, or anywhere this page hears of). Its pages are read against the epoch it began in: one asked for after
 * an erasure is refused. A write that lands once any of those happened, or while an erasure here waits, is taken back.
 */
function useCopy(props: Props, calledOff: CalledOff, erasingNow: RefObject<boolean>) {
  const { name, token, who, epoch, lockedNow, toast } = props
  const client = useQueryClient()
  const account = accountOf({ name, token })
  const open = useMounted()
  const epochNow = useRef(epoch)
  useEffect(() => {
    epochNow.current = epoch
  })
  const [busy, setBusy] = useState(false)
  const busyNow = useRef(false)
  const copyNow = async () => {
    const kept = () =>
      open.current && stillSignedIn(account) && !lockedNow() && !erasingNow.current && epochNow.current === epoch
    const attempt = calledOff.start()
    try {
      const load = async () => exportText(await readCopyExport(props, client, attempt.signal, kept), who)
      await copyFetched(load, browserClip(), kept, () => toast(NOTICE.copied))
      toast(NOTICE.copied)
    } catch (err: unknown) {
      if (err instanceof CopyCalledOff) return // the locked body already says why
      if (err instanceof CopyUnconfirmed) return toast(NOTICE.copyUnconfirmed)
      if (err instanceof CopyStillWriting) return toast(NOTICE.copyStillWriting)
      toast(err instanceof DOMException ? NOTICE.clipboardBlocked : personalFailure(err))
    } finally {
      attempt.abort(new CopyCalledOff('The copy attempt ended'))
      calledOff.done(attempt)
    }
  }
  const copy = () => {
    if (erasingNow.current || busyNow.current) return
    busyNow.current = true
    setBusy(true)
    void copyNow().finally(() => {
      busyNow.current = false
      setBusy(false)
    })
  }
  return { copy, busy }
}

/**
 * Who hears that the browser answered a copy an erasure was refused for: this sheet, for the account it was refused
 * for. Closed, signed out or another account in, the answer is forgotten (copy.ts's forgetAnswered) and never said.
 */
function useAnswered(token: string, toast: ShowToast) {
  const account = tokenSubject(token)
  // One per account the sheet is open for; none once it went.
  const hearing = useRef<object | null>(null)
  useEffect(() => {
    hearing.current = {}
    return () => {
      hearing.current = null
      forgetAnswered()
    }
  }, [account])
  return () => {
    const refusedFor = hearing.current
    return () => {
      if (refusedFor && hearing.current === refusedFor) toast(NOTICE.copyAnswered)
    }
  }
}

export function DataSheet(props: Props) {
  const { space, read, locked, epoch, onClose, returnTo, onUnlock, onErase, toast } = props
  const [erased, setErased] = useState(false)
  const calledOff = useCalledOff(locked, epoch, accountOf({ name: props.name, token: props.token }))
  useSwapFocus(locked)
  // An erasure under way: no copy starts meanwhile, so the two never overlap.
  const [erasing, setErasing] = useState(false)
  const erasingNow = useRef(false)
  const { copy, busy } = useCopy(props, calledOff, erasingNow)
  const answered = useAnswered(props.token, toast)
  const erase = async () => {
    erasingNow.current = true
    setErasing(true)
    calledOff.all() // what is being copied goes with what is erased
    try {
      // And every Personal clipboard write already handed to the browser (this sheet's, an earlier one's, a reply's)
      // is answered first: one still unanswered after the browser's wait may yet land, so nothing is erased. Once it
      // is answered the toast says so, while this sheet is open for the same account.
      await eraseAfterWrites(onErase, answered())
      setErased(true)
      focusSoon('#c-data-h ~ button') // the form goes with what it deleted: the focus goes to the sheet's Close
      toast(NOTICE.erased)
    } catch (err: unknown) {
      toast(erasureRefused(err) ?? personalFailure(err))
    } finally {
      erasingNow.current = false
      setErasing(false)
    }
  }
  return (
    <Sheet id="c-data-h" title="Your data" onClose={onClose} returnTo={returnTo}>
      {erased ? (
        <p className="sheet-lead">{DATA.erased}</p>
      ) : (
        <DataBody {...{ space, read, locked, onUnlock, erasing }} onCopy={copy} copying={busy} onErase={erase} />
      )}
    </Sheet>
  )
}
