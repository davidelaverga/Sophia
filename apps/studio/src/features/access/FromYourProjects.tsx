// Invite people from your other projects (docs/plans/invite-from-projects.md, A26): the people an admin already shares a
// project with, each with a checkbox; one role for the choice, and «Invite N» sends each the same member invitation a
// typed email does, so it is mailed, waits in their list, and only they accept it. One that fails is named and stays
// chosen; a retry sends it with the same key, so an invitation that did land is never made twice.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { createInvitation, listInvitablePeople } from '../../api/access.ts'
import { ROLE_NOTE } from './access-view.ts'
import type { SheetContext } from './useAccess.ts'

type Role = 'editor' | 'viewer'

interface Sent {
  sending: boolean
  sent: number
  failed: string[]
}

const failedWords = (emails: readonly string[]) => `Couldn’t invite ${emails.join(', ')}. Try again.`

/** The people offered, the choice, its role, and the send: one invitation per address, a key kept per address. */
function useChoice({ projectId, identity }: SheetContext, onSent: () => void) {
  const key = ['invitable', projectId, identity.name]
  const read = useQuery({ queryKey: key, queryFn: () => listInvitablePeople(identity.token, projectId) })
  const client = useQueryClient()
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [role, setRole] = useState<Role>('editor')
  const [state, setState] = useState<Sent>({ sending: false, sent: 0, failed: [] })
  // One key per address and role: a retry after a failure is the same request, never a second invitation.
  const keys = useRef(new Map<string, string>())
  const toggle = (email: string) =>
    setChosen((was) => {
      const next = new Set(was)
      if (!next.delete(email)) next.add(email)
      return next
    })
  const invite = async (email: string) => {
    const id = `${email}:${role}`
    const idempotency = keys.current.get(id) ?? crypto.randomUUID()
    keys.current.set(id, idempotency)
    await createInvitation(identity.token, projectId, idempotency, { kind: 'member', role, email })
  }
  const send = async () => {
    setState({ sending: true, sent: 0, failed: [] })
    const emails = [...chosen]
    const outcomes = await Promise.allSettled(emails.map(invite))
    const failed = emails.filter((_, i) => outcomes[i]?.status === 'rejected')
    setChosen(new Set(failed))
    setState({ sending: false, sent: emails.length - failed.length, failed })
    await client.invalidateQueries({ queryKey: key })
    onSent()
  }
  return { people: read.data?.people ?? [], chosen, toggle, role, setRole, state, send }
}

/** What went out, and what didn't. */
function SentNotes({ state }: { state: Sent }) {
  return (
    <>
      {state.sent > 0 && (
        <p className="sheet-status" role="status">
          {`Invited ${String(state.sent)}`}
        </p>
      )}
      {state.failed.length > 0 && (
        <p className="form-error" role="alert">
          {failedWords(state.failed)}
        </p>
      )}
    </>
  )
}

export function FromYourProjects({ context, onSent }: { context: SheetContext; onSent: () => void }) {
  const { people, chosen, toggle, role, setRole, state, send } = useChoice(context, onSent)
  if (people.length === 0 && state.failed.length === 0 && state.sent === 0) return null
  return (
    <fieldset className="invite-from">
      <legend className="field-label">From your projects</legend>
      <ul className="invite-from-people">
        {people.map((p) => (
          <li key={p.actorId}>
            <label>
              <input type="checkbox" checked={chosen.has(p.email)} onChange={() => toggle(p.email)} />
              {p.email}
            </label>
          </li>
        ))}
      </ul>
      <div className="invite-from-acts">
        <div className="field invite-from-role">
          <select
            aria-label="Invite as"
            value={role}
            onChange={(e) => setRole(e.target.value === 'viewer' ? 'viewer' : 'editor')}
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <button
          type="button"
          className="pill primary"
          disabled={chosen.size === 0 || state.sending}
          onClick={() => void send()}
        >
          {state.sending ? 'Inviting…' : `Invite ${String(chosen.size)}`}
        </button>
      </div>
      <p className="role-note">{ROLE_NOTE[role]}</p>
      <SentNotes state={state} />
    </fieldset>
  )
}
