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

export const archivedKey = (identity: Identity) => ['projects', identity.name, 'archived'] as const

/** The person's archived projects (A30), read again as the lists are. */
export function useArchivedProjects(identity: Identity): readonly ProjectSummary[] | undefined {
  const read = useQuery({
    queryKey: archivedKey(identity),
    queryFn: ({ signal }) => listArchivedProjects(identity.token, signal),
    staleTime: 30_000,
  })
  return read.data?.projects
}

const failure = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

/** One write per choice: a retry of the same choice keeps its key; the lists are read again once it lands. */
export function useArchiveWrite(identity: Identity, projectId: string) {
  const client = useQueryClient()
  const keys = useRef(new Map<boolean, string>())
  return async (archived: boolean) => {
    const key = keys.current.get(archived) ?? crypto.randomUUID()
    keys.current.set(archived, key)
    await archiveProject(identity.token, projectId, key, archived)
    keys.current.delete(archived)
    await client.invalidateQueries({ queryKey: ['projects', identity.name] })
  }
}

/** Bring an archived project back from Work's list; the lists are read again once it lands. */
export function useUnarchive(identity: Identity) {
  const client = useQueryClient()
  return async (projectId: string) => {
    await archiveProject(identity.token, projectId, crypto.randomUUID(), false)
    await client.invalidateQueries({ queryKey: ['projects', identity.name] })
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
  const write = useArchiveWrite(identity, projectId)
  const [state, setState] = useState<{ sending: boolean; failed: string | null }>({ sending: false, failed: null })
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => cancel.current?.focus(), [])
  const archive = async () => {
    setState({ sending: true, failed: null })
    try {
      await write(true)
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
  const archived = useArchivedProjects(identity)?.some((p) => p.projectId === projectId) ?? false
  const write = useArchiveWrite(identity, projectId)
  const [state, setState] = useState<{ sending: boolean; failed: string | null }>({ sending: false, failed: null })
  if (!archived) return null
  const unarchive = async () => {
    setState({ sending: true, failed: null })
    try {
      await write(false)
      setState({ sending: false, failed: null })
    } catch (err: unknown) {
      setState({ sending: false, failed: failure(err, 'Couldn’t bring the project back. Try again.') })
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
