// "Your data" (direction C), in the Studio's sheet (app/Sheet.tsx): what the personal space keeps, counted; everything
// as text to copy; and deleting it all, with a typed confirmation for the one thing that can't be undone. Behind the
// padlock it shows nothing of the space, not even the counts, until the person confirms it's them.
import { useEffect, useRef, useState } from 'react'
import type { PersonalSpace } from '@sophia/contracts'
import { exportPersonalSpace } from '../../api/personal.ts'
import { Sheet } from '../../app/Sheet.tsx'
import type { ShowToast } from '../../app/Toast.tsx'
import { browserClip, copyFetched, CopyCalledOff } from './copy.ts'
import { confirmsErasure, DATA, exportText, factsOf, factWords } from './data-view.ts'
import { focusSoon } from './focus.ts'
import { NOTICE } from './notice-view.ts'
import { personalFailure } from './write-words.ts'

interface Props {
  token: string
  who: string
  space: PersonalSpace | undefined
  locked: boolean
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

export function DataSheet(props: Props) {
  const { token, who, space, locked, toast, onClose, returnTo, onUnlock, onErase } = props
  const [erased, setErased] = useState(false)
  useSwapFocus(locked)
  // The padlock as it is now, for a copy whose export arrives after a lock: then nothing is copied.
  const lockedNow = useRef(locked)
  useEffect(() => {
    lockedNow.current = locked
  })
  const copy = async () => {
    try {
      const load = async () => exportText(await exportPersonalSpace(token), who, new Date())
      await copyFetched(load, browserClip(), () => !lockedNow.current)
      toast(NOTICE.copied)
    } catch (err: unknown) {
      if (err instanceof CopyCalledOff) return // the locked body already says why
      toast(err instanceof DOMException ? NOTICE.clipboardBlocked : personalFailure(err))
    }
  }
  const erase = async () => {
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
        <DataBody space={space} locked={locked} onUnlock={onUnlock} onCopy={() => void copy()} onErase={erase} />
      )}
    </Sheet>
  )
}
