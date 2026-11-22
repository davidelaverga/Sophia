// Who is in the project, in the Invite sheet's Members tab (docs/plans/member-roles.md, A27): each member with their
// role, you marked. An admin changes a role from its select, admin included, so the admin role can be handed over;
// a project keeps an admin, and a refusal is said on the row while the select shows the role that stands. A change whose
// reply was lost is read again, and the row says whether it landed (docs/plans/save-reply-lost.md).
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { ProjectMember, ProjectMembers } from '@sophia/contracts'
import { ConfirmButton } from '@sophia/ui'
import { changeMemberRole, getProjectMembers, removeMember } from '../../api/client.ts'
import { replyLost } from '../../api/reply-lost.ts'
import { useMembers } from '../work/GoalTargets.tsx'
import { membershipKey, type SheetContext } from './useAccess.ts'
import { removalKeys } from './removal-keys.ts'
import { memberName } from '../../app/person-name.ts'

type Role = ProjectMember['role']

const ROLE_WORD: Record<Role, string> = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' }
const isRole = (value: string): value is Role => value === 'admin' || value === 'editor' || value === 'viewer'

function RoleSelect(props: { member: ProjectMember; label: string; onChange: (role: Role) => void; busy: boolean }) {
  return (
    <div className="field in-project-role">
      <select
        aria-label={props.label}
        value={props.member.role}
        disabled={props.busy}
        onChange={(e) => {
          if (isRole(e.target.value)) props.onChange(e.target.value)
        }}
      >
        <option value="admin">Admin</option>
        <option value="editor">Editor</option>
        <option value="viewer">Viewer</option>
      </select>
    </div>
  )
}

/** What a row says after a change or a removal: a refusal as an alert, a change found landed as a status. */
interface RowNote {
  text: string
  polite?: boolean
}

/** Each member's row on its own: a change or a removal on the way, and what it said last. */
interface Rows {
  busy: ReadonlySet<string>
  notes: ReadonlyMap<string, RowNote>
}

const UNCHANGED = 'Couldn’t change the role.'

/**
 * After a lost reply, what stands says whether the role changed: the member's role as sent, or not; with the members
 * read, which the rows then stand on. A read that fails too tells nothing, so today's words stay.
 */
async function roleChecked(
  { projectId, identity }: SheetContext,
  actorId: string,
  role: Role,
): Promise<{ note: RowNote; read?: ProjectMembers }> {
  try {
    const read = await getProjectMembers(identity.token, projectId)
    const landed = read.members.find((m) => m.actorId === actorId)?.role === role
    return {
      note: landed
        ? { text: 'Saved. The reply was slow, so we checked.', polite: true }
        : { text: 'The role wasn’t changed. Try again.' },
      read,
    }
  } catch {
    return { note: { text: UNCHANGED } }
  }
}

/** The rows' state, one member at a time: one row's answer never frees or clears another's. */
function useRows() {
  const [rows, setRows] = useState<Rows>({ busy: new Set(), notes: new Map() })
  /** A change or a removal starts on this row: its select waits, its last line goes. */
  const begin = (actorId: string) =>
    setRows((r) => {
      const notes = new Map(r.notes)
      notes.delete(actorId)
      return { busy: new Set(r.busy).add(actorId), notes }
    })
  /** It is answered: the row is free again, and says `note` if there is one. */
  const end = (actorId: string, note: RowNote | null = null) =>
    setRows((r) => {
      const busy = new Set(r.busy)
      busy.delete(actorId)
      const notes = new Map(r.notes)
      if (note) notes.set(actorId, note)
      else notes.delete(actorId)
      return { busy, notes }
    })
  return { rows, begin, end }
}

/** A role change in flight, and what its row says; reads the members and one's own membership again after. */
function useRoleChange(context: SheetContext) {
  const { projectId, identity } = context
  const client = useQueryClient()
  const { rows, begin, end } = useRows()
  const membersKey = ['members', projectId, identity.name]
  const readAgain = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: membersKey }),
      client.invalidateQueries({ queryKey: membershipKey(projectId, identity.name) }),
    ])
  const change = (member: ProjectMember) => (role: Role) => {
    begin(member.actorId)
    changeMemberRole(identity.token, projectId, member.actorId, role).then(
      async () => {
        end(member.actorId)
        await readAgain()
      },
      async (err: unknown) => {
        if (!replyLost(err)) return end(member.actorId, { text: err instanceof Error ? err.message : UNCHANGED })
        const { note, read } = await roleChecked(context, member.actorId, role)
        // The select reads the role that stands before the line is said, never beside the old one.
        if (read) client.setQueryData(membersKey, read)
        end(member.actorId, note)
        await readAgain()
      },
    )
  }
  // One key per member removal: a retry after an unknown outcome is the same removal (A29); confirmed, it is retired.
  const keys = useRef(removalKeys())
  const remove = (member: ProjectMember) => () => {
    const key = keys.current.keyFor(member.actorId)
    begin(member.actorId)
    removeMember(identity.token, projectId, member.actorId, key).then(
      async () => {
        // Done: a later removal of the same person (invited back) is a new one (Codex P2 on #356).
        keys.current.confirmed(member.actorId)
        end(member.actorId)
        // The row goes with the read below: the focus goes to the list's heading first (Codex P1 on #356).
        document.getElementById('in-project-title')?.focus()
        await client.invalidateQueries({ queryKey: membersKey })
      },
      (err: unknown) => end(member.actorId, { text: err instanceof Error ? err.message : 'Couldn’t remove them.' }),
    )
  }
  return { rows, change, remove }
}

function RowSaid({ note }: { note: RowNote }) {
  return note.polite ? (
    <p className="sheet-status" role="status">
      {note.text}
    </p>
  ) : (
    <p className="form-error" role="alert">
      {note.text}
    </p>
  )
}

export function InProject({ context }: { context: SheetContext }) {
  const { projectId, identity } = context
  const members = useMembers({ projectId, identity, cursor: undefined })
  const admin = context.membership?.role === 'admin'
  const me = context.membership?.actorId
  const { rows, change, remove } = useRoleChange(context)
  if (members.length === 0) return null
  return (
    <section className="in-project">
      <h3 className="field-label" id="in-project-title" tabIndex={-1}>
        In this project
      </h3>
      <ul className="in-project-people" aria-labelledby="in-project-title">
        {members.map((m) => {
          const mine = m.actorId === me
          const name = memberName(m.name)
          const note = rows.notes.get(m.actorId)
          return (
            <li key={m.actorId}>
              <span className="in-project-name">{mine ? `${name} · you` : name}</span>
              {admin ? (
                <RoleSelect
                  member={m}
                  label={mine ? 'Your role' : `Role of ${name}`}
                  busy={rows.busy.has(m.actorId)}
                  onChange={change(m)}
                />
              ) : (
                <span className="in-project-role-words">{ROLE_WORD[m.role]}</span>
              )}
              {admin && !mine && (
                <ConfirmButton
                  label="Remove"
                  warning="They leave the project and its call. A new invitation brings them back."
                  confirm="Remove from project"
                  disabled={rows.busy.has(m.actorId)}
                  onConfirm={remove(m)}
                />
              )}
              {note && <RowSaid note={note} />}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
