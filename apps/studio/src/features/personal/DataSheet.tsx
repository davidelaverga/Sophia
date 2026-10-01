// "Your data" (direction C), in the Studio's sheet (app/Sheet.tsx): what the personal space keeps, counted; everything
// as text to copy; and deleting it all, with a typed confirmation for the one thing that can't be undone. Behind the
// padlock it shows nothing of the space, not even the counts, until the person confirms it's them.
import { useEffect, useRef, useState } from 'react'
import type { PersonalSpace } from '@sophia/contracts'
import { exportPersonalSpace } from '../../api/personal.ts'
import { Sheet } from '../../app/Sheet.tsx'
import type { ShowToast } from '../../app/Toast.tsx'
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

/**
 * Copies text still being fetched. Safari allows a copy only while the press itself is handled, and the export comes
 * later: the clipboard is handed the text as a promise there and then. Where that isn't offered, it is copied once
 * fetched. A failed fetch says so as itself, not as a blocked clipboard.
 */
async function copyFetched(load: () => Promise<string>): Promise<void> {
  if (!('ClipboardItem' in window)) {
    await navigator.clipboard.writeText(await load())
    return
  }
  const fetched: { error?: unknown } = {}
  const text = load().catch((err: unknown) => {
    fetched.error = err
    throw err
  })
  const blob = text.then((t) => new Blob([t], { type: 'text/plain' }))
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })])
  } catch (err: unknown) {
    throw fetched.error ?? err
  }
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
  const copy = async () => {
    try {
      await copyFetched(async () => exportText(await exportPersonalSpace(token), who, new Date()))
      toast(NOTICE.copied)
    } catch (err: unknown) {
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
