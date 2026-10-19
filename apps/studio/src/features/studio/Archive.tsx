// Archiving a project (docs/plans/archive-project.md, A30): an admin archives it, after a question, or brings it back;
// archived, it leaves the lists, stays readable, and says so inside. Each choice is one write under one key, so a retry
// is the same choice; the lists are read again after it.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Membership, ProjectSummary } from '@sophia/contracts'
import { Button } from '@sophia/ui'
import { archiveProject } from '../../api/client.ts'
import { listArchivedProjects } from '../../api/personal.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Sheet } from '../../app/Sheet.tsx'
import { READ_FAILED, readState } from '../personal/places-view.ts'
import { usePresses } from '../personal/presses.ts'
import type { Read } from '../personal/ReadNotes.tsx'
import { archiveKeys } from './archive-keys.ts'

export const archivedKey = (identity: Identity) => ['projects', identity.name, 'archived'] as const

/** The read of the person's archived projects (A30), read again as the lists are. */
const useArchivedRead = (identity: Identity) =>
  useQuery({
    queryKey: archivedKey(identity),
    queryFn: ({ signal }) => listArchivedProjects(identity.token, signal),
    staleTime: 30_000,
  })

/** Whether a project is archived, as the read of the archived ones says: unknown while it has nothing to say. */
export type ArchiveStatus = 'archived' | 'not-archived' | 'unknown'

/**
 * Whether this project is among the person's archived ones: unknown until that read lands, and while it fails with
 * nothing read before, so nothing inside the project claims it, or acts on it, either way (only Work says the read
 * failed; Codex on #469).
 */
export function useArchiveStatus(identity: Identity, projectId: string): ArchiveStatus {
  const projects = useArchivedRead(identity).data?.projects
  if (!projects) return 'unknown'
  return projects.some((p) => p.projectId === projectId) ? 'archived' : 'not-archived'
}

const failure = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

/** Kept while the page lives (archive-keys.ts), not by the sheet, the line or Work's list that pressed. */
const keys = archiveKeys()

/**
 * One write per choice: a retry of the same choice keeps its key, wherever it is pressed from, until it is answered;
 * the lists are read again once it lands.
 */
export function useArchiveWrite(identity: Identity) {
  const client = useQueryClient()
  return async (projectId: string, archived: boolean) => {
    const choice = { account: identity.name, projectId, archived }
    try {
      await archiveProject(identity.token, projectId, keys.keyFor(choice), archived)
    } catch (err: unknown) {
      keys.settled(choice, err)
      throw err
    }
    keys.settled(choice)
    await client.invalidateQueries({ queryKey: ['projects', identity.name] })
  }
}

/** What a failed Unarchive says when the API gives no words of its own. */
const UNARCHIVE_FAILED = 'Couldn’t bring the project back. Try again.'

/** Where a project's Unarchive in Work stands: on its way, or what its last try failed with, until the next press. */
export interface Unarchiving {
  sending: boolean
  failed: string | null
}

/** Work's «Archived» (archive-project.md), as Places hands it to WorkSpace. */
export interface ArchivedWork {
  /** Undefined until the list has been read (`read` says how that goes). */
  projects: readonly ProjectSummary[] | undefined
  /** A failed read is said where «Archived» goes, with Try again: none archived is never what a failure looks like. */
  read: Read
  onUnarchive: (projectId: string) => void
  unarchiving: (projectId: string) => Unarchiving
}

/**
 * Work's archived projects, as read (a failed read says so: Codex on #368), and each Unarchive kept on its row until it
 * is answered: it goes through the presses (presses.ts), as Take back does, so its row says «Bringing back…» and a
 * second press sends nothing; a failure is said on the row, in the line's words, until the next press. The lists are
 * read again once it lands.
 */
export function useArchivedWork(identity: Identity): ArchivedWork {
  const read = useArchivedRead(identity)
  const write = useArchiveWrite(identity)
  const presses = usePresses()
  const [failed, setFailed] = useState<ReadonlyMap<string, string>>(() => new Map())
  const say = (projectId: string, words: string | null) =>
    setFailed((was) => {
      const next = new Map(was)
      if (words === null) next.delete(projectId)
      else next.set(projectId, words)
      return next
    })
  return {
    projects: read.data?.projects,
    read: { state: readState(read), failed: READ_FAILED.archived, retry: () => void read.refetch() },
    onUnarchive: (projectId) =>
      presses.press(projectId, async () => {
        say(projectId, null)
        await write(projectId, false).catch((err: unknown) => say(projectId, failure(err, UNARCHIVE_FAILED)))
      }),
    unarchiving: (projectId) => ({ sending: presses.waits(projectId), failed: failed.get(projectId) ?? null }),
  }
}

interface SheetProps {
  title: string
  projectId: string
  identity: Identity
  onClose: () => void
  /** Archived: the call in its room ends, and the person goes to Work, as leaving does. */
  onArchived: () => Promise<void>
}

export function ArchiveSheet({ title, projectId, identity, onClose, onArchived }: SheetProps) {
  const write = useArchiveWrite(identity)
  const [state, setState] = useState<{ sending: boolean; failed: string | null }>({ sending: false, failed: null })
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => cancel.current?.focus(), [])
  const archive = async () => {
    setState({ sending: true, failed: null })
    try {
      await write(projectId, true)
    } catch (err: unknown) {
      setState({ sending: false, failed: failure(err, 'Couldn’t archive the project. Try again.') })
      return
    }
    onClose()
    await onArchived()
  }
  return (
    <Sheet id="archive-project-title" title="Archive project" onClose={onClose}>
      <div className="sheet-form">
        <p className="leave-note">
          «{title}» leaves everyone’s list of projects. It stays as it is, readable from Archived in Your projects, and
          an admin can bring it back.
        </p>
        {state.failed && <p role="alert">{state.failed}</p>}
        <div className="rename-acts">
          <Button ref={cancel} kind="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            kind="primary"
            aria-disabled={state.sending || undefined}
            onClick={() => !state.sending && void archive()}
          >
            {state.sending ? 'Archiving…' : 'Archive'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/** Inside an archived project, under the header: it says so, and an admin brings it back. */
export function ArchivedLine({
  projectId,
  identity,
  membership,
}: {
  projectId: string
  identity: Identity
  membership: Membership | undefined
}) {
  const admin = membership?.role === 'admin'
  const status = useArchiveStatus(identity, projectId)
  const write = useArchiveWrite(identity)
  const [state, setState] = useState<{ sending: boolean; failed: string | null }>({ sending: false, failed: null })
  if (status !== 'archived') return null
  const unarchive = async () => {
    setState({ sending: true, failed: null })
    try {
      await write(projectId, false)
      setState({ sending: false, failed: null })
    } catch (err: unknown) {
      setState({ sending: false, failed: failure(err, UNARCHIVE_FAILED) })
    }
  }
  return (
    <div className="archived-line" role="status">
      <span>This project is archived. It’s out of everyone’s list of projects.</span>
      {admin && (
        <button
          type="button"
          className="text-button"
          aria-disabled={state.sending || undefined}
          onClick={() => !state.sending && void unarchive()}
        >
          {state.sending ? 'Bringing back…' : 'Unarchive'}
        </button>
      )}
      {state.failed && <span role="alert">{state.failed}</span>}
    </div>
  )
}
