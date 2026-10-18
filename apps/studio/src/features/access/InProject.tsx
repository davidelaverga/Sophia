// Who is in the project, in the Invite sheet's Members tab (docs/plans/member-roles.md, A27): each member with their
// role, you marked. An admin changes a role from its select, admin included, so the admin role can be handed over;
// a project keeps an admin, and a refusal is said on the row while the select shows the role that stands.
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { ProjectMember } from '@sophia/contracts'
import { ConfirmButton } from '@sophia/ui'
import { changeMemberRole, removeMember } from '../../api/client.ts'
import { useMembers } from '../work/GoalTargets.tsx'
import { membershipKey, type SheetContext } from './useAccess.ts'
import { removalKeys } from './removal-keys.ts'

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

/** A role change in flight, and the refusal on its row; reads the members and one's own membership again after. */
function useRoleChange({ projectId, identity }: SheetContext) {
  const client = useQueryClient()
  const [state, setState] = useState<{ busy: string | null; failed: { actorId: string; text: string } | null }>({
    busy: null,
    failed: null,
  })
  const change = (member: ProjectMember) => (role: Role) => {
    setState({ busy: member.actorId, failed: null })
    changeMemberRole(identity.token, projectId, member.actorId, role).then(
      async () => {
        setState({ busy: null, failed: null })
        await Promise.all([
          client.invalidateQueries({ queryKey: ['members', projectId, identity.name] }),
          client.invalidateQueries({ queryKey: membershipKey(projectId, identity.name) }),
        ])
      },
      (err: unknown) =>
        setState({
          busy: null,
          failed: { actorId: member.actorId, text: err instanceof Error ? err.message : 'Couldn’t change the role.' },
        }),
    )
  }
  // One key per member removal: a retry after an unknown outcome is the same removal (A29); confirmed, it is retired.
  const keys = useRef(removalKeys())
  const remove = (member: ProjectMember) => () => {
    const key = keys.current.keyFor(member.actorId)
    setState({ busy: member.actorId, failed: null })
    removeMember(identity.token, projectId, member.actorId, key).then(
      async () => {
        // Done: a later removal of the same person (invited back) is a new one (Codex P2 on #356).
        keys.current.confirmed(member.actorId)
        setState({ busy: null, failed: null })
        // The row goes with the read below: the focus goes to the list's heading first (Codex P1 on #356).
        document.getElementById('in-project-title')?.focus()
        await client.invalidateQueries({ queryKey: ['members', projectId, identity.name] })
      },
      (err: unknown) =>
        setState({
          busy: null,
          failed: { actorId: member.actorId, text: err instanceof Error ? err.message : 'Couldn’t remove them.' },
        }),
    )
  }
  return { state, change, remove }
}

export function InProject({ context }: { context: SheetContext }) {
  const { projectId, identity } = context
  const members = useMembers({ projectId, identity, cursor: undefined })
  const admin = context.membership?.role === 'admin'
  const me = context.membership?.actorId
  const { state, change, remove } = useRoleChange(context)
  if (members.length === 0) return null
  return (
    <section className="in-project">
      <h3 className="field-label" id="in-project-title" tabIndex={-1}>
        In this project
      </h3>
      <ul className="in-project-people" aria-labelledby="in-project-title">
        {members.map((m) => {
          const mine = m.actorId === me
          const name = m.name ?? 'A member'
          return (
            <li key={m.actorId}>
              <span className="in-project-name">{mine ? `${name} · you` : name}</span>
              {admin ? (
                <RoleSelect
                  member={m}
                  label={mine ? 'Your role' : `Role of ${name}`}
                  busy={state.busy === m.actorId}
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
                  disabled={state.busy === m.actorId}
                  onConfirm={remove(m)}
                />
              )}
              {state.failed?.actorId === m.actorId && (
                <p className="form-error" role="alert">
                  {state.failed.text}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
