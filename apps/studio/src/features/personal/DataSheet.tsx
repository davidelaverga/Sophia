// "Your data" (direction C), in the Studio's sheet (app/Sheet.tsx): what the personal space keeps, counted; everything
// as text to copy; and deleting it all, with a typed confirmation for the one thing that can't be undone. Behind the
// padlock, copying and deleting wait for the person to confirm it's them.
import { useState } from 'react'
import type { PersonalSpace } from '@sophia/contracts'
import { exportPersonalSpace } from '../../api/personal.ts'
import { Sheet } from '../../app/Sheet.tsx'
import type { ShowToast } from '../../app/Toast.tsx'
import { confirmsErasure, DATA, exportText, factsOf, factWords } from './data-view.ts'
import { NOTICE } from './notice-view.ts'
import { personalFailure } from './write-words.ts'

interface Props {
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
      <strong>{DATA.erase}</strong>
      <p>{DATA.eraseSays}</p>
      <label className="field-label" htmlFor="c-del">
        {DATA.confirm}
      </label>
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault()
          setBusy(true)
          void onErase().finally(() => setBusy(false))
        }}
      >
        <input id="c-del" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        <button className="pill danger" type="submit" disabled={!confirmsErasure(typed) || busy}>
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
        <Facts space={space} />
        <p className="muted">{DATA.locked}</p>
        <button className="pill" type="button" onClick={onUnlock}>
          {DATA.unlock}
        </button>
      </>
    )
  }
  return (
    <>
      <Facts space={space} />
      <button className="pill" type="button" onClick={onCopy}>
        {DATA.copy}
      </button>
      <Erase onErase={onErase} />
    </>
  )
}

export function DataSheet(props: Props) {
  const { token, who, space, locked, toast, onClose, onUnlock, onErase } = props
  const [erased, setErased] = useState(false)
  const copy = async () => {
    try {
      const everything = await exportPersonalSpace(token)
      await navigator.clipboard.writeText(exportText(everything, who, new Date()))
      toast(NOTICE.copied)
    } catch (err: unknown) {
      toast(err instanceof DOMException ? NOTICE.clipboardBlocked : personalFailure(err))
    }
  }
  const erase = async () => {
    try {
      await onErase()
      setErased(true)
      toast(NOTICE.erased)
    } catch (err: unknown) {
      toast(personalFailure(err))
    }
  }
  return (
    <Sheet id="c-data-h" title="Your data" onClose={onClose}>
      {erased ? (
        <p className="sheet-lead">{DATA.erased}</p>
      ) : (
        <DataBody space={space} locked={locked} onUnlock={onUnlock} onCopy={() => void copy()} onErase={erase} />
      )}
    </Sheet>
  )
}
