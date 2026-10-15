// The project's title in the header (docs/plans/project-rename.md): words for everyone; for an admin, a press that
// opens the kit's menu «Project», whose Rename… opens a sheet. The rename is idempotent per key (A21): a retry after an
// unknown outcome sends the same key, so it is never a second rename. Saved, the snapshot and the projects' list are
// read again, and the header says the new name.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Icon, Menu, MenuItem, usePopover } from '@sophia/ui'
import { renameProject } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Sheet } from '../../app/Sheet.tsx'
import { snapshotKey } from './useProjectFeed.ts'

interface Props {
  title: string
  admin: boolean
  projectId: string
  identity: Identity
}

/** The most a title holds (A21), counted as the API counts it. */
const TITLE_MOST = 180

function RenameSheet({ title, projectId, identity, onClose }: Omit<Props, 'admin'> & { onClose: () => void }) {
  const [name, setName] = useState(title)
  const [key] = useState(() => crypto.randomUUID())
  const [state, setState] = useState<{ sending: boolean; failed: string | null }>({ sending: false, failed: null })
  const field = useRef<HTMLInputElement>(null)
  const client = useQueryClient()
  useEffect(() => field.current?.select(), [])
  const next = name.trim()
  const offered = next !== '' && name !== title && !state.sending
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
      setState({
        sending: false,
        failed: err instanceof Error ? err.message : 'Couldn’t rename the project. Try again.',
      })
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

export function ProjectName(props: Props) {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const menu = usePopover(open, () => setOpen(false))
  if (!props.admin) return props.title
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
          <MenuItem
            onClick={() => {
              setOpen(false)
              setRenaming(true)
            }}
          >
            Rename…
          </MenuItem>
        </Menu>
      )}
      {renaming &&
        createPortal(
          <RenameSheet
            title={props.title}
            projectId={props.projectId}
            identity={props.identity}
            onClose={() => setRenaming(false)}
          />,
          document.body,
        )}
    </span>
  )
}
