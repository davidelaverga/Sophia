// The project's title in the header (docs/plans/project-rename.md, project-leave.md): for a member, a press that opens
// the kit's menu «Project»: Rename… for an admin, Leave project… for anyone. Each opens its sheet. Both writes are
// idempotent per key (A21, A22): a retry after an unknown outcome sends the same key, so it is never a second write.
// Renamed, the snapshot and the projects' list are read again; left, the call ends and the person goes to Work.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Membership } from '@sophia/contracts'
import { Button, Icon, Menu, MenuItem, usePopover } from '@sophia/ui'
import { ApiError, leaveProject, renameProject } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Sheet } from '../../app/Sheet.tsx'
import { membershipKey } from '../access/useAccess.ts'
import { ActivitySheet } from './ActivitySheet.tsx'
import { ArchiveSheet, useArchiveStatus } from './Archive.tsx'
import { snapshotKey } from './useProjectFeed.ts'

interface Props {
  title: string
  /** The viewer's role once the project is read; null while it isn't, and the title is words alone. */
  role: Membership['role'] | null
  projectId: string
  identity: Identity
  /** Left: end a call in the project's room and go to Work. */
  onLeft: () => Promise<void>
}

type SheetProps = Pick<Props, 'title' | 'projectId' | 'identity'> & { onClose: () => void }

/** The most a title holds (A21), counted as the API counts it. */
const TITLE_MOST = 180

/** Where the only admin goes before leaving (member-roles.md). */
const LAST_ADMIN_HINT = 'Make another member an admin in Invite › Members first.'

const failure = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback)

function RenameSheet({ title, projectId, identity, onClose }: SheetProps) {
  const [name, setName] = useState(title)
  const [key] = useState(() => crypto.randomUUID())
  const [state, setState] = useState<{ sending: boolean; failed: string | null }>({ sending: false, failed: null })
  const field = useRef<HTMLInputElement>(null)
  const client = useQueryClient()
  useEffect(() => field.current?.select(), [])
  const offered = name.trim() !== '' && name !== title && !state.sending
  const save = async () => {
    if (!offered) return
    setState({ sending: true, failed: null })
    try {
      await renameProject(identity.token, projectId, key, name)
      await Promise.all([
        client.invalidateQueries({ queryKey: snapshotKey(projectId, identity.name) }),
        client.invalidateQueries({ queryKey: ['projects', identity.name] }),
      ])
      onClose()
    } catch (err: unknown) {
      setState({ sending: false, failed: failure(err, 'Couldn’t rename the project. Try again.') })
    }
  }
  return (
    <Sheet id="rename-project-title" title="Rename project" onClose={onClose}>
      <form
        className="sheet-form"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label className="field-label" htmlFor="rename-project">
          Project name
        </label>
        <div className="field">
          <input
            ref={field}
            id="rename-project"
            value={name}
            maxLength={TITLE_MOST}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {state.failed && <p role="alert">{state.failed}</p>}
        <div className="rename-acts">
          <Button kind="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button kind="primary" type="submit" disabled={!offered}>
            {state.sending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

function LeaveSheet({ title, projectId, identity, onClose, onLeft }: SheetProps & Pick<Props, 'onLeft'>) {
  const [key] = useState(() => crypto.randomUUID())
  const [state, setState] = useState<{ sending: boolean; failed: string | null }>({ sending: false, failed: null })
  const cancel = useRef<HTMLButtonElement>(null)
  const client = useQueryClient()
  useEffect(() => cancel.current?.focus(), [])
  const leave = async () => {
    setState({ sending: true, failed: null })
    try {
      await leaveProject(identity.token, projectId, key)
    } catch (err: unknown) {
      const lastAdmin = err instanceof ApiError && err.code === 'invalid_state'
      const said = failure(err, 'Couldn’t leave the project. Try again.')
      setState({ sending: false, failed: lastAdmin ? `${said}. ${LAST_ADMIN_HINT}` : said })
      return
    }
    onClose()
    await onLeft()
    // The role held here is gone: a new invitation is read afresh, never from this cache (Codex P2 on #349).
    client.removeQueries({ queryKey: membershipKey(projectId, identity.name) })
    await client.invalidateQueries({ queryKey: ['projects', identity.name] })
  }
  return (
    <Sheet id="leave-project-title" title="Leave project" onClose={onClose}>
      <div className="sheet-form">
        <p className="leave-note">
          You’ll leave «{title}» and its room, and it leaves your list. To come back, someone sends you a new
          invitation.
        </p>
        {state.failed && <p role="alert">{state.failed}</p>}
        <div className="rename-acts">
          <Button ref={cancel} kind="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button kind="danger" disabled={state.sending} onClick={() => void leave()}>
            {state.sending ? 'Leaving…' : 'Leave project'}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

type Chosen = 'rename' | 'leave' | 'activity' | 'archive'

export function ProjectName(props: Props) {
  const [open, setOpen] = useState(false)
  const [sheet, setSheet] = useState<Chosen | null>(null)
  const menu = usePopover(open, () => setOpen(false))
  // Archived already, archiving changes nothing, yet would end the call: the line under the header brings it back. So
  // it is offered only once the project is known not archived, never while that read loads or fails (Codex on #469).
  const archivable = useArchiveStatus(props.identity, props.projectId) === 'not-archived'
  if (!props.role) return props.title
  const choose = (next: Chosen) => () => {
    setOpen(false)
    setSheet(next)
  }
  const shared = {
    title: props.title,
    projectId: props.projectId,
    identity: props.identity,
    onClose: () => setSheet(null),
  }
  return (
    <span ref={menu.wrap} className="project-name-menu">
      <button
        ref={menu.opener}
        type="button"
        className="project-name-open"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="project-name-text">{props.title}</span>
        <Icon name="chevron" />
      </button>
      {open && (
        <Menu popover={menu} label="Project" side="bottom" align="start">
          {props.role === 'admin' && <MenuItem onClick={choose('rename')}>Rename…</MenuItem>}
          {props.role === 'admin' && <MenuItem onClick={choose('activity')}>Activity</MenuItem>}
          {props.role === 'admin' && archivable && <MenuItem onClick={choose('archive')}>Archive project…</MenuItem>}
          <MenuItem onClick={choose('leave')}>Leave project…</MenuItem>
        </Menu>
      )}
      {sheet === 'rename' && createPortal(<RenameSheet {...shared} />, document.body)}
      {sheet === 'activity' &&
        createPortal(
          <ActivitySheet projectId={props.projectId} identity={props.identity} onClose={() => setSheet(null)} />,
          document.body,
        )}
      {sheet === 'leave' && createPortal(<LeaveSheet {...shared} onLeft={props.onLeft} />, document.body)}
      {/* Archived, as left: the call in its room ends and the person goes to Work (archive-project.md). */}
      {sheet === 'archive' && createPortal(<ArchiveSheet {...shared} onArchived={props.onLeft} />, document.body)}
    </span>
  )
}
