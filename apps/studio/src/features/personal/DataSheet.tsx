// "Your data" (direction C), in the Studio's sheet (app/Sheet.tsx): what the personal space keeps, counted; everything
// as text to copy; and deleting it all, with a typed confirmation for the one thing that can't be undone. Behind the
// padlock it shows nothing of the space, not even the counts, until the person confirms it's them.
import { useEffect, useRef, useState } from 'react'
import type { PersonalSpace } from '@sophia/contracts'
import { exportPersonalSpace } from '../../api/personal.ts'
import { Sheet } from '../../app/Sheet.tsx'
import type { ShowToast } from '../../app/Toast.tsx'
import { useMounted } from '../../app/useMounted.ts'
import { browserClip, copyFetched, CopyCalledOff } from './copy.ts'
import { confirmsErasure, DATA, exportText, factsOf, factWords } from './data-view.ts'
import { focusSoon } from './focus.ts'
import { NOTICE } from './notice-view.ts'
import { personalFailure } from './write-words.ts'

interface Props {
  token: string
  who: string
  space: PersonalSpace | undefined
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

function Facts({ space }: { space: PersonalSpace | undefined }) {
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
  space: PersonalSpace | undefined
  locked: boolean
  onUnlock: () => void
  onCopy: () => void
  onErase: () => Promise<void>
}

function DataBody({ space, locked, onUnlock, onCopy, onErase }: BodyProps) {
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
      <Facts space={space} />
      <button id="c-data-copy" className="pill" type="button" onClick={onCopy}>
        {DATA.copy}
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
function useCalledOff(locked: boolean, epoch: number) {
  const exports = useRef(new Set<AbortController>())
  const all = () => {
    for (const one of exports.current) one.abort(new CopyCalledOff('The padlock shut, the sheet went, or an erasure'))
    exports.current.clear()
  }
  const callOff = useRef(all)
  useEffect(() => {
    callOff.current = all
  })
  useEffect(() => () => callOff.current(), [locked, epoch])
  return {
    all,
    signal: () => {
      const one = new AbortController()
      exports.current.add(one)
      return one.signal
    },
  }
}

export function DataSheet(props: Props) {
  const { token, who, space, epoch, locked, lockedNow, toast, onClose, returnTo, onUnlock, onErase } = props
  const [erased, setErased] = useState(false)
  const open = useMounted()
  const calledOff = useCalledOff(locked, epoch)
  useSwapFocus(locked)
  // A copy whose export arrives once the padlock is shut (as stored then, wherever it was shut) or the sheet has gone
  // (closed, signing out) copies nothing; one still on its way then stops at once, and so does one when the space is
  // erased (here, or anywhere this page hears of). Its pages are read against the epoch it began in: one asked for
  // after an erasure is refused.
  // The copy on its way, so an erasure waits for its clipboard write to settle: nothing erased lands there after.
  const copying = useRef<Promise<void>>(Promise.resolve())
  const copy = () => {
    copying.current = copyNow()
  }
  const copyNow = async () => {
    try {
      const signal = calledOff.signal()
      const load = async () => exportText(await exportPersonalSpace(token, epoch, signal), who, new Date())
      await copyFetched(load, browserClip(), () => open.current && !lockedNow())
      toast(NOTICE.copied)
    } catch (err: unknown) {
      if (err instanceof CopyCalledOff) return // the locked body already says why
      toast(err instanceof DOMException ? NOTICE.clipboardBlocked : personalFailure(err))
    }
  }
  const erase = async () => {
    calledOff.all() // what is being copied goes with what is erased
    await copying.current // and a clipboard write already under way settles first
    try {
      await onErase()
      setErased(true)
      focusSoon('#c-data-h ~ button') // the form goes with what it deleted: the focus goes to the sheet's Close
      toast(NOTICE.erased)
    } catch (err: unknown) {
      toast(personalFailure(err))
    }
  }
  return (
    <Sheet id="c-data-h" title="Your data" onClose={onClose} returnTo={returnTo}>
      {erased ? (
        <p className="sheet-lead">{DATA.erased}</p>
      ) : (
        <DataBody space={space} locked={locked} onUnlock={onUnlock} onCopy={copy} onErase={erase} />
      )}
    </Sheet>
  )
}
