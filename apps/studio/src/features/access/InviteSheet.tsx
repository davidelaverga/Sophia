// Invite: the room's link and its QR for guests, emailed invitations, and the room's calendar. A sheet over
// the Studio; nothing here changes the room itself until someone uses a link. Every action says when it is
// working and when it failed, every link can be copied by hand, and what cuts someone off asks first.
import { useRef, useState } from 'react'
import type { Invitation, InvitationCreate, LobbyEntry } from '@sophia/contracts'
import { ConfirmButton, Icon, SwapLabel, Tip } from '@sophia/ui'
import { createInvitation, reissueInvitation, revokeInvitation } from '../../api/access.ts'
import { ApiError } from '../../api/client.ts'
import { useAdmission, type AdmissionState } from '../../api/useAdmission.ts'
import { nextInRow } from '../../app/roving.ts'
import { useDialog } from '../../app/useDialog.ts'
import { invitationState, knockNote, linkLimits, removalNote } from './access-view.ts'
import { CalendarTab } from './CalendarTab.tsx'
import { QrCode } from './QrCode.tsx'
import { useInvitations, useLobbyDecision, useRefreshInvitations, type SheetContext } from './useAccess.ts'

type Tab = 'guests' | 'members' | 'calendar'
const TABS: ReadonlyArray<[Tab, string]> = [
  ['guests', 'Guests'],
  ['members', 'Members'],
  ['calendar', 'Calendar'],
]
const TAB_ROW = TABS.map(([t]) => t)

const isOpen = (i: Invitation) => !i.revokedAt && Date.parse(i.expiresAt) > Date.now() && i.uses < i.maxUses

/** The room link: the newest open guest invitation that was not sent to one person. */
const roomLink = (list: readonly Invitation[]) => list.find((i) => i.kind === 'guest' && !i.email && isOpen(i)) ?? null

/** What happened to the email, and what to do when it did not go out. */
const EMAIL: Record<Invitation['emailStatus'], string> = {
  none: '',
  sent: 'Sent.',
  failed: 'The email didn’t go out. Copy the link and send it yourself.',
  not_configured: 'Email isn’t set up here. Copy the link and send it yourself.',
}

export function InviteSheet({ context, onClose }: { context: SheetContext; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('guests')
  const panel = useRef<HTMLDivElement>(null)
  useDialog(panel, onClose)
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
        <SheetTabs tab={tab} onTab={setTab} />
        <div id="invite-panel" role="tabpanel" aria-labelledby={`invite-tab-${tab}`}>
          {tab === 'guests' && <GuestsTab context={context} />}
          {tab === 'members' && <MembersTab context={context} onGuests={() => setTab('guests')} />}
          {tab === 'calendar' && <CalendarTab context={context} />}
        </div>
      </div>
    </div>
  )
}

function SheetTabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const buttons = useRef(new Map<Tab, HTMLButtonElement>())
  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = nextInRow(TAB_ROW, tab, e.key)
    if (!next) return
    e.preventDefault()
    onTab(next)
    buttons.current.get(next)?.focus()
  }
  return (
    <div className="sheet-tabs" role="tablist" aria-label="Invite" onKeyDown={onKeyDown}>
      {TABS.map(([t, label]) => (
        <button
          key={t}
          ref={(el) => {
            if (el) buttons.current.set(t, el)
          }}
          type="button"
          role="tab"
          id={`invite-tab-${t}`}
          aria-selected={t === tab}
          aria-controls="invite-panel"
          tabIndex={t === tab ? 0 : -1}
          onClick={() => onTab(t)}
        >
          {label}
        </button>
      ))}
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

/** One action at a time, its failure said in words (the API's own when it is a refusal); then a refresh. */
function useAction(refresh: () => void) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = async (key: string, action: () => Promise<unknown>, failure: string) => {
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (err: unknown) {
      setError(err instanceof ApiError && err.status > 0 && err.status < 500 ? err.message : failure)
    } finally {
      setBusy(null)
      refresh()
    }
  }
  return { busy, error, run }
}

/** Copy with a word of thanks that fades back: the label swaps in place, so nothing moves. */
function CopyButton({ text, quiet = false }: { text: string; quiet?: boolean }) {
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
    <button type="button" className={quiet ? 'ghost' : 'pill'} onClick={() => void copy()}>
      <SwapLabel value={done ? 'done' : 'copy'} labels={{ copy: 'Copy link', done: 'Copied' }} />
    </button>
  )
}

/** An admission's outcome in words: its refusal, or an unanswered request with its retry. */
function AdmissionNote<A, R>({ state, onRetry }: { state: AdmissionState<A, R>; onRetry: () => void }) {
  if (state.status === 'rejected') return <>{state.error.message}</>
  if (state.status !== 'unknown') return null
  return (
    <>
      Sophia didn’t answer.{' '}
      <button type="button" className="text-button" onClick={onRetry}>
        Try again
      </button>
    </>
  )
}

function GuestsTab({ context }: { context: SheetContext }) {
  const { query, refresh } = useInviteList(context)
  const invitations = query.data?.invitations ?? []
  const emailed = invitations.filter((i) => i.kind === 'guest' && !!i.email)
  return (
    <section className="sheet-body" aria-label="Guests">
      <p className="sheet-lead">
        A link to the room. Guests say their name and wait in the lobby until someone here lets them in. They reach the
        call only, never the project.
      </p>
      <RoomLinkSlot context={context} loading={query.isPending} link={roomLink(invitations)} onChange={refresh} />
      <EmailGuest context={context} onSent={refresh} />
      {emailed.length > 0 && (
        <div className="sheet-form">
          <p className="field-label">Guests invited by email</p>
          <InvitationList invitations={emailed} token={context.identity.token} onChange={refresh} />
        </div>
      )}
      <GuestDoor context={context} />
    </section>
  )
}

interface SlotProps {
  context: SheetContext
  loading: boolean
  link: Invitation | null
  onChange: () => void
}

/** While the list loads, nothing to press: a create button there would make a second link. */
function RoomLinkSlot({ context, loading, link, onChange }: SlotProps) {
  if (loading) return <p className="sheet-status">Loading the room link…</p>
  if (!link) return <CreateRoomLink context={context} onChange={onChange} />
  return <RoomLink token={context.identity.token} link={link} onChange={onChange} />
}

function CreateRoomLink({ context, onChange }: { context: SheetContext; onChange: () => void }) {
  const create = useAdmission<InvitationCreate, Invitation>((key, body) =>
    createInvitation(context.identity.token, context.projectId, key, body),
  )
  const sending = create.state.status === 'sending'
  return (
    <>
      <button
        type="button"
        className="pill primary"
        disabled={sending}
        onClick={() => void create.submit({ kind: 'guest' }).then(onChange)}
      >
        {sending ? 'Creating…' : 'Create the room link'}
      </button>
      <p className="sheet-status" role="status">
        <AdmissionNote state={create.state} onRetry={() => void create.retry().then(onChange)} />
      </p>
    </>
  )
}

function RoomLink({ token, link, onChange }: { token: string; link: Invitation; onChange: () => void }) {
  const action = useAction(onChange)
  return (
    <div className="room-link">
      <QrCode value={link.url} label="QR code of the room link" />
      <p className="link-text">{link.url}</p>
      <p className="link-limits">{linkLimits(link)}</p>
      <div className="control-row">
        <CopyButton text={link.url} />
        <ConfirmButton
          label="Replace link"
          warning="The current link and its QR code stop working."
          confirm="Replace"
          disabled={!!action.busy}
          onConfirm={() =>
            void action.run('replace', () => reissueInvitation(token, link.id), 'Couldn’t replace the link. Try again.')
          }
        />
        <ConfirmButton
          label="Turn off link"
          warning="Nobody new can use it. Guests already inside stay."
          confirm="Turn off"
          disabled={!!action.busy}
          onConfirm={() =>
            void action.run('off', () => revokeInvitation(token, link.id), 'Couldn’t turn the link off. Try again.')
          }
        />
      </div>
      {action.error && (
        <p className="form-error" role="alert">
          {action.error}
        </p>
      )}
    </div>
  )
}

/**
 * The door's record: guests let in (out of the call for now, or for good), those declined in the last day
 * (let in after all, or block), and those blocked (unblock). What ends a call or shuts the door asks first;
 * the rest undo each other.
 */
function GuestDoor({ context }: { context: SheetContext }) {
  const { busy, error, decide } = useLobbyDecision(context.projectId, context.identity)
  const by = (status: LobbyEntry['status']) => context.lobby.filter((e) => e.status === status)
  const block = (e: LobbyEntry, warning: string) => (
    <ConfirmButton
      label="Block"
      warning={warning}
      confirm="Block"
      disabled={busy}
      onConfirm={() => void decide([e], 'block')}
    />
  )
  return (
    <>
      <DoorList title="Guests let in" entries={by('admitted')}>
        {(e) => (
          <>
            <ConfirmButton
              label="Remove"
              warning={`${e.displayName} leaves the call and can ask to come back in a minute.`}
              confirm="Remove"
              disabled={busy}
              onConfirm={() => void decide([e], 'deny')}
            />
            {block(e, `${e.displayName} leaves the call and can’t ask again from this device.`)}
          </>
        )}
      </DoorList>
      <DoorList title="Declined today" entries={by('denied')}>
        {(e) => (
          <>
            {block(e, 'They can’t ask again from this device.')}
            <button type="button" className="ghost" disabled={busy} onClick={() => void decide([e], 'admit')}>
              Let in
            </button>
          </>
        )}
      </DoorList>
      <DoorList
        title="Blocked"
        entries={by('blocked')}
        note="A block holds on the device they used. To stop everyone new, replace the room link."
      >
        {(e) => (
          <button type="button" className="ghost" disabled={busy} onClick={() => void decide([e], 'unblock')}>
            Unblock
          </button>
        )}
      </DoorList>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

interface DoorListProps {
  title: string
  entries: readonly LobbyEntry[]
  note?: string
  children: (entry: LobbyEntry) => React.ReactNode
}

function DoorList({ title, entries, note, children }: DoorListProps) {
  if (entries.length === 0) return null
  return (
    <div className="sheet-form">
      <p className="field-label">{title}</p>
      <ul className="invitation-list">
        {entries.map((e) => (
          <li key={e.id}>
            <span className="invitation-who">{e.displayName}</span>
            <span className="invitation-state" title={e.removal?.lastError ?? undefined}>
              {removalNote(e.removal) || knockNote(e.knocks) || 'guest'}
            </span>
            <span className="invitation-actions">{children(e)}</span>
          </li>
        ))}
      </ul>
      {note && <p className="sheet-status">{note}</p>}
    </div>
  )
}

/** Each emailed guest gets a link of their own, so it can be turned off without turning off the room link. */
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
          {create.state.status === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </div>
      <SentNote state={create.state} onRetry={() => void create.retry().then(onSent)} />
    </form>
  )
}

/** After sending: done, or the link itself when the email could not carry it. */
function SentNote({ state, onRetry }: { state: AdmissionState<InvitationCreate, Invitation>; onRetry: () => void }) {
  if (state.status !== 'done') {
    return (
      <p className="sheet-status" role="status">
        <AdmissionNote state={state} onRetry={onRetry} />
      </p>
    )
  }
  const { emailStatus, url } = state.result
  const byHand = emailStatus === 'failed' || emailStatus === 'not_configured'
  return (
    <p className="sheet-status" role="status">
      {EMAIL[emailStatus]} {byHand && <CopyButton text={url} quiet />}
    </p>
  )
}

function MembersTab({ context, onGuests }: { context: SheetContext; onGuests: () => void }) {
  const { query, refresh } = useInviteList(context)
  if (context.membership?.role !== 'admin') {
    return (
      <section className="sheet-body">
        <p className="sheet-lead">Only project admins can add members. You can still invite guests to the call.</p>
        <button type="button" className="pill" onClick={onGuests}>
          Go to Guests
        </button>
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
        {create.state.status === 'sending' ? 'Sending…' : 'Send invitation'}
      </button>
      <SentNote state={create.state} onRetry={() => void create.retry().then(onSent)} />
    </form>
  )
}

interface ListProps {
  invitations: Invitation[]
  token: string
  onChange: () => void
}

/** Invitations sent to one person: each open one can be copied, sent again or cancelled. */
function InvitationList({ invitations, token, onChange }: ListProps) {
  const action = useAction(onChange)
  if (invitations.length === 0) return null
  const now = Date.now()
  return (
    <>
      <ul className="invitation-list">
        {invitations.map((i) => (
          <li key={i.id} data-closed={!isOpen(i) || undefined}>
            <span className="invitation-who">{i.email}</span>
            <span className="invitation-state">{invitationState(i, now)}</span>
            {isOpen(i) && (
              <span className="invitation-actions">
                <CopyButton text={i.url} quiet />
                <button
                  type="button"
                  className="ghost"
                  disabled={action.busy === i.id}
                  onClick={() =>
                    void action.run(i.id, () => reissueInvitation(token, i.id), 'Couldn’t send it again. Try again.')
                  }
                >
                  Send again
                </button>
                <ConfirmButton
                  label="Cancel"
                  warning="The emailed link stops working."
                  confirm="Cancel invitation"
                  disabled={action.busy === i.id}
                  onConfirm={() =>
                    void action.run(i.id, () => revokeInvitation(token, i.id), 'Couldn’t cancel it. Try again.')
                  }
                />
              </span>
            )}
          </li>
        ))}
      </ul>
      {action.error && (
        <p className="form-error" role="alert">
          {action.error}
        </p>
      )}
    </>
  )
}
