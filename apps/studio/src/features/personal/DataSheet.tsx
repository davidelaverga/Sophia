// "Your data" (direction C): what the personal space keeps, counted; everything as text to copy; and deleting it all,
// with a typed confirmation for the one thing that can't be undone. Behind the padlock, copying and deleting wait for
// the person to confirm it's them.
import { useEffect, useRef, useState } from 'react'
import type { PersonalSpace } from '@sophia/contracts'
import { exportPersonalSpace } from '../../api/personal.ts'
import { confirmsErasure, exportText, factsOf, factWords } from './data-view.ts'
import type { ShowToast } from './Toast.tsx'
import { personalFailure } from './write-words.ts'

interface Props {
  open: boolean
  token: string
  who: string
  space: PersonalSpace | undefined
  locked: boolean
  toast: ShowToast
  onClose: () => void
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
      <strong>Delete all personal data</strong>
      <p>Conversations and notes are removed for good. What you carried to projects stays there.</p>
      <label className="caps" htmlFor="c-del">
        Type <b style={{ color: 'var(--text)' }}>delete</b> to confirm
      </label>
      <input id="c-del" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      <button
        className="btn danger"
        type="button"
        disabled={!confirmsErasure(typed) || busy}
        onClick={() => {
          setBusy(true)
          void onErase().finally(() => setBusy(false))
        }}
      >
        {busy ? 'Deleting…' : 'Delete everything'}
      </button>
    </div>
  )
}

interface BodyProps {
  erased: boolean
  space: PersonalSpace | undefined
  locked: boolean
  onUnlock: () => void
  onCopy: () => void
  onErase: () => Promise<void>
}

function DataBody({ erased, space, locked, onUnlock, onCopy, onErase }: BodyProps) {
  if (erased) return <p>Your personal space is empty. Sophia starts fresh with you, and your projects are unchanged.</p>
  return (
    <>
      <Facts space={space} />
      {locked ? (
        <>
          <button className="btn" type="button" onClick={onUnlock}>
            Unlock to copy or delete
          </button>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Your personal side is locked.
          </p>
        </>
      ) : (
        <>
          <button className="btn" type="button" onClick={onCopy}>
            Copy everything as text
          </button>
          <Erase onErase={onErase} />
        </>
      )}
    </>
  )
}

export function DataSheet(props: Props) {
  const { open, token, who, space, locked, toast, onClose, onUnlock, onErase } = props
  const close = useRef<HTMLButtonElement>(null)
  const [erased, setErased] = useState(false)
  useEffect(() => {
    if (open) close.current?.focus()
    else setErased(false)
  }, [open])
  const copy = async () => {
    try {
      const everything = await exportPersonalSpace(token)
      await navigator.clipboard.writeText(exportText(everything, who, new Date()))
      toast('Copied to your clipboard')
    } catch (err: unknown) {
      toast(
        err instanceof DOMException ? 'Couldn’t copy here. Your browser blocked the clipboard.' : personalFailure(err),
      )
    }
  }
  const erase = async () => {
    try {
      await onErase()
      setErased(true)
      toast('Deleted. Sophia starts fresh.')
    } catch (err: unknown) {
      toast(personalFailure(err))
    }
  }
  return (
    <aside className={`data-sheet${open ? ' open' : ''}`} aria-labelledby="c-data-h" aria-hidden={!open}>
      <div className="drawer-head">
        <h2 id="c-data-h">Your data</h2>
        <button ref={close} className="btn ghost close-btn" type="button" aria-label="Close" onClick={onClose}>
          <kbd>Esc</kbd>
          <span className="touch-only">Done</span>
        </button>
      </div>
      <div className="data-body">
        <DataBody
          erased={erased}
          space={space}
          locked={locked}
          onUnlock={onUnlock}
          onCopy={() => void copy()}
          onErase={erase}
        />
      </div>
    </aside>
  )
}
