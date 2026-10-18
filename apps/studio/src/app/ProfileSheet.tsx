// «Your name» (docs/plans/profile-editor.md): the name the people in your projects see beside what you write (A32). It
// is read once and held while the person types, so nothing moves its revision behind them. Save is one admission per
// edit (useAdmission): no reply keeps the field and offers Try again with the same key and name, never a second edit;
// a name changed elsewhere since the read is said as a conflict, the typed name kept and offered again over the new
// revision; a name the API refuses is said in place. The email stays the person's own: it is never sent as a name.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Profile, ProfileUpdate } from '@sophia/contracts'
import { Button } from '@sophia/ui'
import { ApiError } from '../api/client.ts'
import { getMyProfile, updateMyProfile } from '../api/profile.ts'
import { useAdmission, type AdmissionState } from '../api/useAdmission.ts'
import { AdmissionNote } from '../features/access/AdmissionNote.tsx'
import type { Identity } from './dev-identity.ts'
import {
  canSave,
  CONFLICT_UNREAD,
  conflictWords,
  nameProblem,
  READ_WORDS,
  SAVED_WORDS,
  saveWords,
  type ReadTrouble,
} from './profile-view.ts'
import { Sheet } from './Sheet.tsx'
import { SlowNote } from './SignIn.tsx'
import { profileKey, useMyProfile } from './useMyProfile.ts'

/** What was read and is being edited over: the name kept and its revision. */
interface Base {
  kept: string | null
  revision: number
}

const baseOf = (p: Profile): Base => ({ kept: p.displayName, revision: p.revision })

type Note = { kind: 'saved' | 'conflict'; words: string } | null

/** After a conflict: reading the name kept now, or that read failed and must be asked again before any save. */
type Fresh = 'reading' | 'failed' | null

/**
 * After a conflict, the name kept now, read afresh: only a read that answers becomes the base saved over (`onRead`).
 * Until then Save waits; a read that fails says so and is asked again, never a cached answer shown as the current one.
 */
function useFreshRead(identity: Identity, onRead: (now: Profile) => void) {
  const client = useQueryClient()
  const [fresh, setFresh] = useState<Fresh>(null)
  const readFresh = async () => {
    setFresh('reading')
    try {
      const now = await getMyProfile(identity.token)
      client.setQueryData(profileKey(identity), now)
      onRead(now)
      setFresh(null)
    } catch {
      setFresh('failed')
    }
  }
  return { fresh, readFresh }
}

/** The edit: what was read, what is typed, and the save's admission with its outcomes. */
function useNameEdit(identity: Identity) {
  const { profile, trouble, reread } = useMyProfile(identity)
  const client = useQueryClient()
  const [base, setBase] = useState<Base | null>(null)
  const [typed, setTyped] = useState('')
  const [note, setNote] = useState<Note>(null)
  // Seeded once, from the first profile read: a later read never replaces what is typed.
  useEffect(() => {
    if (base || !profile) return
    setBase(baseOf(profile))
    setTyped(profile.displayName ?? '')
  }, [base, profile])
  const { fresh, readFresh } = useFreshRead(identity, (now) => {
    setBase(baseOf(now))
    setNote({ kind: 'conflict', words: conflictWords(now.displayName) })
  })
  // A save's outcome: kept, or a conflict read again. A refusal and no reply stay in the admission's state.
  const save = useAdmission(async (key: string, body: ProfileUpdate) => {
    try {
      const kept = await updateMyProfile(identity.token, key, body)
      client.setQueryData(profileKey(identity), kept)
      setBase(baseOf(kept))
      setTyped(kept.displayName ?? '')
      setNote({ kind: 'saved', words: SAVED_WORDS })
      // The members' lists name this person: read again where they are open.
      void client.invalidateQueries({ queryKey: ['members'] })
      return kept
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === 'stale_revision') void readFresh()
      throw err
    }
  })
  const waiting = save.state.status === 'sending' || save.state.status === 'unknown' || fresh === 'reading'
  const offered = base !== null && !waiting && fresh === null && canSave(typed, base.kept)
  return {
    base,
    typed,
    note,
    trouble,
    reread,
    save,
    waiting,
    offered,
    fresh,
    readFresh: () => void readFresh(),
    type: (value: string) => {
      setTyped(value)
      if (note?.kind === 'saved') setNote(null)
    },
    send: () => {
      if (!base || !offered) return
      setNote(null)
      void save.send({ displayName: typed.trim(), expectedRevision: base.revision })
    },
  }
}

type Edit = ReturnType<typeof useNameEdit>

/** Before there is a name to edit: reading, or why not (no profiles here, signed out, a read that failed). */
function ReadNote({ trouble, reread }: { trouble: ReadTrouble | null; reread: () => void }) {
  return (
    <div className="sheet-form" aria-busy={trouble === null}>
      {trouble ? (
        <p role="alert">
          {READ_WORDS[trouble]}
          {trouble === 'failed' && (
            <>
              {' '}
              <button type="button" className="text-button" onClick={reread}>
                Try again
              </button>
            </>
          )}
        </p>
      ) : (
        <>
          <p className="sheet-status">Reading…</p>
          <SlowNote />
        </>
      )}
    </div>
  )
}

/** What a save that didn't keep the name says: a refusal in words, or no reply with Try again (the same key). */
function SaveTrouble({ state, retry }: { state: AdmissionState<ProfileUpdate, Profile>; retry: () => void }) {
  if (state.status === 'unknown') {
    return (
      <p role="alert">
        <AdmissionNote state={state} onRetry={retry} />
      </p>
    )
  }
  if (state.status !== 'rejected' || state.error.code === 'stale_revision') return null
  return <p role="alert">{saveWords(state.error, state.args.displayName)}</p>
}

/** Under the field: a refused or unanswered save, a conflict whose name couldn't be read, and a wait that is long. */
function FormTrouble({ edit }: { edit: Edit }) {
  return (
    <>
      <SaveTrouble state={edit.save.state} retry={() => void edit.save.retry()} />
      {edit.fresh === 'failed' && (
        <p role="alert">
          {CONFLICT_UNREAD}{' '}
          <button type="button" className="text-button" onClick={edit.readFresh}>
            Try again
          </button>
        </p>
      )}
      {(edit.save.state.status === 'sending' || edit.fresh === 'reading') && <SlowNote />}
    </>
  )
}

function NameForm({ edit, base, onClose }: { edit: Edit; base: Base; onClose: () => void }) {
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => field.current?.select(), [])
  const problem = nameProblem(edit.typed)
  const dirty = edit.typed.trim() !== (base.kept ?? '')
  return (
    <form
      className="sheet-form"
      onSubmit={(e) => {
        e.preventDefault()
        edit.send()
      }}
    >
      <label className="field-label" htmlFor="profile-name">
        Name
      </label>
      <p className="role-note" id="profile-name-note">
        The people in your projects see it beside what you write.
      </p>
      <div className="field">
        <input
          ref={field}
          id="profile-name"
          value={edit.typed}
          autoComplete="name"
          readOnly={edit.waiting}
          aria-describedby="profile-name-note"
          aria-invalid={problem !== null}
          onChange={(e) => edit.type(e.target.value)}
        />
      </div>
      {problem && <p role="alert">{problem}</p>}
      <FormTrouble edit={edit} />
      {edit.note && (
        <p className="sheet-status" role="status">
          {edit.note.words}
        </p>
      )}
      <div className="rename-acts">
        {/* The sheet's head has Close; Cancel is said only while an edit would be dropped. */}
        {dirty && (
          <Button kind="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
        )}
        <Button kind="primary" type="submit" disabled={!edit.offered}>
          {edit.save.state.status === 'sending' ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}

export function ProfileSheet({ identity, onClose }: { identity: Identity; onClose: () => void }) {
  const edit = useNameEdit(identity)
  return (
    <Sheet id="profile-title" title="Your name" onClose={onClose}>
      {edit.base ? (
        <NameForm edit={edit} base={edit.base} onClose={onClose} />
      ) : (
        <ReadNote trouble={edit.trouble} reread={() => void edit.reread()} />
      )}
    </Sheet>
  )
}
