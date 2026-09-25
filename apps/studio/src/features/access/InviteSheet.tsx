// Invite: the room's link and its QR for guests, emailed invitations for members, and the room's calendar.
// A sheet over the Studio; nothing here changes the room itself until someone uses a link.
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Invitation, InvitationCreate } from '@sophia/contracts'
import { Icon, SwapLabel, Tip } from '@sophia/ui'
import { createInvitation, decideLobbyEntry, reissueInvitation, revokeInvitation } from '../../api/access.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import { CalendarTab } from './CalendarTab.tsx'
import { QrCode } from './QrCode.tsx'
import { useInvitations, useRefreshInvitations, type SheetContext } from './useAccess.ts'

type Tab = 'guests' | 'members' | 'calendar'
const TABS: ReadonlyArray<[Tab, string]> = [
  ['guests', 'Guests'],
  ['members', 'Members'],
  ['calendar', 'Calendar'],
]

const isOpen = (i: Invitation) => !i.revokedAt && Date.parse(i.expiresAt) > Date.now() && i.uses < i.maxUses

/** The room link: the newest open guest invitation that was not sent to one person. */
const roomLink = (list: readonly Invitation[]) => list.find((i) => i.kind === 'guest' && !i.email && isOpen(i)) ?? null

const EMAIL: Record<Invitation['emailStatus'], string> = {
  none: '',
  sent: 'Sent',
  failed: 'Not sent: the email service refused it',
  not_configured: 'Email is not set up on this server: share the link yourself',
}

export function InviteSheet({ context, onClose }: { context: SheetContext; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('guests')
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} className="sheet" role="dialog" aria-modal="true" aria-labelledby="invite-title" tabIndex={-1}>
        <header className="sheet-head">
          <h2 id="invite-title">Invite</h2>
          <button type="button" className="round has-tip" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
            <Tip label="Close" keys="Esc" side="bottom" align="end" />
          </button>
        </header>
        <div className="sheet-tabs" role="tablist" aria-label="Invite">
          {TABS.map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={t === tab} onClick={() => setTab(t)}>
              {label}
            </button>
          ))}
        </div>
        {tab === 'guests' && <GuestsTab context={context} />}
        {tab === 'members' && <MembersTab context={context} />}
        {tab === 'calendar' && <CalendarTab context={context} />}
      </div>
    </div>
  )
}

function useInviteList(context: SheetContext) {
  const { projectId, identity } = context
  return {
    query: useInvitations(projectId, identity.name, identity.token, true),
    refresh: useRefreshInvitations(projectId, identity.name),
  }
}

/** Copy with a word of thanks that fades back: the label swaps in place, so nothing moves. */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch {
      // Clipboard unavailable: the link is on screen to select.
    }
  }
  return (
    <button type="button" className="pill" onClick={() => void copy()}>
      <SwapLabel value={done ? 'done' : 'copy'} labels={{ copy: 'Copy link', done: 'Copied' }} />
    </button>
  )
}

function GuestsTab({ context }: { context: SheetContext }) {
  const { query, refresh } = useInviteList(context)
  const token = context.identity.token
  const link = roomLink(query.data?.invitations ?? [])
  const create = useAdmission<InvitationCreate, Invitation>((key, body) =>
    createInvitation(token, context.projectId, key, body),
  )
  const run = async (action: () => Promise<unknown>) => {
    await action()
    refresh()
  }
  return (
    <section className="sheet-body" aria-label="Guests">
      <p className="sheet-lead">
        A link to the room. Guests say their name and wait in the lobby until someone here lets them in. They reach the
        call only, never the project.
      </p>
      {link ? (
        <div className="room-link">
          <QrCode value={link.url} label="QR code of the room link" />
          <p className="link-text">{link.url}</p>
          <div className="control-row">
            <CopyButton text={link.url} />
            <button type="button" className="ghost" onClick={() => void run(() => reissueInvitation(token, link.id))}>
              New link
            </button>
            <button type="button" className="ghost" onClick={() => void run(() => revokeInvitation(token, link.id))}>
              Close it
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="pill primary" onClick={() => void run(() => create.submit({ kind: 'guest' }))}>
          Create the room link
        </button>
      )}
      <EmailGuest context={context} onSent={refresh} />
      <GuestsInRoom context={context} />
    </section>
  )
}

/** Guests let in stay until someone takes them out: removing one ends their call and closes their entry. */
function GuestsInRoom({ context }: { context: SheetContext }) {
  const queryClient = useQueryClient()
  const inside = context.lobby.filter((e) => e.status === 'admitted')
  if (inside.length === 0) return null
  const remove = async (entryId: string) => {
    await decideLobbyEntry(context.identity.token, entryId, 'deny')
    void queryClient.invalidateQueries({ queryKey: snapshotKey(context.projectId, context.identity.name) })
  }
  return (
    <div className="sheet-form">
      <p className="field-label">Guests in the room</p>
      <ul className="invitation-list">
        {inside.map((e) => (
          <li key={e.id}>
            <span className="invitation-who">{e.displayName}</span>
            <span className="invitation-state">guest</span>
            <span className="invitation-actions">
              <button type="button" className="ghost" onClick={() => void remove(e.id)}>
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Each emailed guest gets a link of their own, so it can be closed without closing the room link. */
function EmailGuest({ context, onSent }: { context: SheetContext; onSent: () => void }) {
  const [email, setEmail] = useState('')
  const create = useAdmission<InvitationCreate, Invitation>((key, body) =>
    createInvitation(context.identity.token, context.projectId, key, body),
  )
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const sent = await create.submit({ kind: 'guest', email: email.trim() })
    if (sent) setEmail('')
    onSent()
  }
  const result = create.state.status === 'done' ? EMAIL[create.state.result.emailStatus] : null
  return (
    <form className="sheet-form" onSubmit={(e) => void submit(e)}>
      <label htmlFor="guest-email" className="field-label">
        Send a guest their own link
      </label>
      <div className="field">
        <input
          id="guest-email"
          type="email"
          required
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="pill" disabled={create.state.status === 'sending'}>
          Send
        </button>
      </div>
      <p className="sheet-status" role="status">
        {create.state.status === 'rejected' ? create.state.error.message : result}
      </p>
    </form>
  )
}

function MembersTab({ context }: { context: SheetContext }) {
  const { query, refresh } = useInviteList(context)
  if (context.membership?.role !== 'admin') {
    return (
      <section className="sheet-body">
        <p className="sheet-lead">Only a project admin can invite members. Guests can join from the Guests tab.</p>
      </section>
    )
  }
  const members = (query.data?.invitations ?? []).filter((i) => i.kind === 'member')
  return (
    <section className="sheet-body" aria-label="Members">
      <p className="sheet-lead">
        A member works in the project with you. The invitation is bound to one email: only that person can accept it.
      </p>
      <MemberForm context={context} onSent={refresh} />
      <InvitationList invitations={members} token={context.identity.token} onChange={refresh} />
    </section>
  )
}

function MemberForm({ context, onSent }: { context: SheetContext; onSent: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const create = useAdmission<InvitationCreate, Invitation>((key, body) =>
    createInvitation(context.identity.token, context.projectId, key, body),
  )
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (await create.submit({ kind: 'member', role, email: email.trim() })) setEmail('')
    onSent()
  }
  return (
    <form className="sheet-form" onSubmit={(e) => void submit(e)}>
      <div className="field">
        <label htmlFor="member-email" className="sr-only">
          Email
        </label>
        <input
          id="member-email"
          type="email"
          required
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select
          aria-label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value === 'viewer' ? 'viewer' : 'editor')}
        >
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      <button type="submit" className="pill primary" disabled={create.state.status === 'sending'}>
        Send invitation
      </button>
      <p className="sheet-status" role="status">
        {create.state.status === 'rejected' && create.state.error.message}
        {create.state.status === 'done' && EMAIL[create.state.result.emailStatus]}
      </p>
    </form>
  )
}

function InvitationList({
  invitations,
  token,
  onChange,
}: {
  invitations: Invitation[]
  token: string
  onChange: () => void
}) {
  if (invitations.length === 0) return null
  const act = async (action: () => Promise<unknown>) => {
    await action()
    onChange()
  }
  return (
    <ul className="invitation-list">
      {invitations.map((i) => (
        <li key={i.id} data-closed={!isOpen(i) || undefined}>
          <span className="invitation-who">{i.email}</span>
          <span className="invitation-state">
            {i.uses > 0 ? 'joined' : i.revokedAt ? 'closed' : `${i.role ?? ''} · ${EMAIL[i.emailStatus] || 'not sent'}`}
          </span>
          {isOpen(i) && (
            <span className="invitation-actions">
              <button type="button" className="ghost" onClick={() => void act(() => reissueInvitation(token, i.id))}>
                Send again
              </button>
              <button type="button" className="ghost" onClick={() => void act(() => revokeInvitation(token, i.id))}>
                Close
              </button>
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
