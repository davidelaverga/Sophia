// /join#<token>: someone opened an invitation link. The page says where it leads (a public preview), then
// either lets a guest ask to come in (their name, the lobby, the call) or signs an invited member in and adds
// them to the project. The token stays in the fragment and reaches the API only in request bodies.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { InvitationPreview, LobbyEntry } from '@sophia/contracts'
import { acceptInvitation, getLobbyEntry, knockRoom, previewInvitation } from '../../api/access.ts'
import { ApiError } from '../../api/client.ts'
import { authMode, currentToken, guestAccessToken, sendInvitedSignIn, type AuthState } from '../../app/auth.ts'
import { useDocumentTitle } from '../../app/document-title.ts'
import { devIdentities, type Identity } from '../../app/dev-identity.ts'
import { Centered, CodeForm, HomeLink } from '../../app/SignIn.tsx'
import { countdown, freshJoinToken, readJoinToken, sessionLabel } from './access-view.ts'
import { GuestRoom, VisitEnd } from './GuestRoom.tsx'

interface Props {
  auth: AuthState
  onChooseDev: (identity: Identity) => void
  onSignOut: () => void
  onOpenProject: (projectId: string) => void
}

const CLOSED: Record<Exclude<InvitationPreview['state'], 'open'>, string> = {
  expired: 'This invitation has expired. Ask for a new link.',
  revoked: 'This link was closed by the room. Ask for a new one.',
  used_up: 'This link has been used as many times as it allows. Ask for a new one.',
}

/**
 * The link's token, kept on this device for an hour: the sign-in email's own link opens a new tab, which comes
 * back to /join without the fragment and must still find it. Once the invitation did its job, it is dropped.
 */
const PENDING = 'sophia.join'

function joinToken(): string | null {
  const fromLink = readJoinToken(window.location.hash)
  try {
    if (fromLink) localStorage.setItem(PENDING, JSON.stringify({ token: fromLink, at: Date.now() }))
    return fromLink ?? freshJoinToken(localStorage.getItem(PENDING), Date.now())
  } catch {
    return fromLink // storage unavailable: the link itself still works
  }
}

function forgetJoinToken(): void {
  try {
    localStorage.removeItem(PENDING)
  } catch {
    // storage unavailable: nothing was kept
  }
}

/** Only the API's own refusal means the link is bad; a network failure or an outage says nothing about it. */
const linkRefused = (err: Error) => err instanceof ApiError && err.status < 500

export function JoinFlow({ auth, onChooseDev, onSignOut, onOpenProject }: Props) {
  const [token] = useState(joinToken)
  const preview = useQuery({
    queryKey: ['join-preview', token],
    queryFn: () => previewInvitation(token ?? ''),
    enabled: !!token,
    retry: false,
  })
  if (!token) return <MissingToken signedIn={auth.status === 'signed_in'} />
  if (preview.isPending) return <Centered title="Opening the room…" busy />
  if (preview.isError && !linkRefused(preview.error)) return <Unreachable onRetry={() => void preview.refetch()} />
  if (preview.isError) return <Closed text="This link does not open a room. Ask for a new one." />
  if (preview.data.state !== 'open') return <Closed text={CLOSED[preview.data.state]} />
  const identity = auth.status === 'signed_in' ? auth.identity : null
  return preview.data.kind === 'guest' ? (
    <GuestJoin preview={preview.data} token={token} identity={identity} />
  ) : (
    <MemberJoin
      preview={preview.data}
      token={token}
      identity={identity}
      onChooseDev={onChooseDev}
      onSignOut={onSignOut}
      onOpenProject={onOpenProject}
    />
  )
}

function Closed({ text }: { text: string }) {
  return (
    <Centered title="This door is closed">
      <p>{text}</p>
      <HomeLink />
    </Centered>
  )
}

/** A signed-in person without a token most likely came back from the sign-in email in another tab. */
function MissingToken({ signedIn }: { signedIn: boolean }) {
  if (!signedIn) return <Closed text="This link is incomplete. Ask for the whole link, or a new one." />
  return (
    <Centered title="You’re signed in">
      <p>To accept the invitation, open the invitation email again and use its link.</p>
      <HomeLink />
    </Centered>
  )
}

function Unreachable({ onRetry }: { onRetry: () => void }) {
  return (
    <Centered title="Can’t reach Sophia">
      <p>Your link is probably fine. Check your connection and try again.</p>
      <button type="button" className="pill" onClick={onRetry}>
        Try again
      </button>
    </Centered>
  )
}

function SessionNote({ preview }: { preview: InvitationPreview }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  if (!preview.session) return null
  return (
    <p className="join-session">
      {preview.session.title} · {sessionLabel(preview.session, now)} · {countdown(preview.session, now)}
    </p>
  )
}

type GuestStep =
  | { step: 'name'; error: string | null }
  | { step: 'knocking' }
  | { step: 'waiting'; entry: LobbyEntry; accessToken: string }
  | { step: 'in'; entry: LobbyEntry; accessToken: string }

/** Knocking: a guest session (or the signed-in person's), then the lobby entry; the link has done its job. */
function useKnock(token: string, identity: Identity | null) {
  const [state, setState] = useState<GuestStep>({ step: 'name', error: null })
  const knock = async (name: string) => {
    setState({ step: 'knocking' })
    try {
      const accessToken = await guestAccessToken(identity)
      const entry = await knockRoom(accessToken, token, name)
      forgetJoinToken()
      setState({ step: entry.status === 'admitted' ? 'in' : 'waiting', entry, accessToken })
    } catch (err: unknown) {
      setState({ step: 'name', error: err instanceof Error ? err.message : 'Could not knock.' })
    }
  }
  return { state, setState, knock }
}

function GuestJoin({
  preview,
  token,
  identity,
}: {
  preview: InvitationPreview
  token: string
  identity: Identity | null
}) {
  const { state, setState, knock } = useKnock(token, identity)
  const [name, setName] = useState('')
  // Without an account, the visit is an anonymous session that must not outlive it on a shared device.
  const anonymous = !identity
  if (state.step === 'in') {
    return (
      <GuestRoom
        accessToken={state.accessToken}
        entry={state.entry}
        projectTitle={preview.projectTitle}
        anonymous={anonymous}
      />
    )
  }
  if (state.step === 'waiting') {
    return (
      <Waiting
        preview={preview}
        entry={state.entry}
        accessToken={state.accessToken}
        anonymous={anonymous}
        onIn={(entry) => setState({ ...state, step: 'in', entry })}
      />
    )
  }
  return (
    <Centered title={`${inviter(preview)} invited you to the room`}>
      <p>
        “{preview.projectTitle}” is a room where people and Sophia think together. Say your name, and someone inside
        lets you in.
      </p>
      <SessionNote preview={preview} />
      <KnockForm
        name={name}
        onName={setName}
        busy={state.step === 'knocking'}
        error={state.step === 'name' ? state.error : null}
        onKnock={(e) => {
          e.preventDefault()
          void knock(name.trim())
        }}
      />
    </Centered>
  )
}

interface KnockProps {
  name: string
  onName: (name: string) => void
  busy: boolean
  error: string | null
  onKnock: (e: React.FormEvent) => void
}

function KnockForm({ name, onName, busy, error, onKnock }: KnockProps) {
  return (
    <>
      <form className="field" onSubmit={onKnock}>
        <label htmlFor="guest-name" className="sr-only">
          Your name
        </label>
        <input
          id="guest-name"
          required
          maxLength={60}
          autoComplete="name"
          placeholder="Your name"
          value={name}
          onChange={(e) => onName(e.target.value)}
        />
        <button type="submit" className="pill primary" disabled={busy || !name.trim()}>
          {busy ? 'Knocking…' : 'Ask to come in'}
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

const inviter = (p: InvitationPreview) => {
  const local = p.inviterName?.split('@')[0] ?? 'Someone'
  const word = local.split(/[.\-_+\s]/)[0] || local
  return word.charAt(0).toUpperCase() + word.slice(1)
}

const POLL_MS = 2500
/** Missed polls in a row before the guest is told Sophia is out of reach (a single miss is retried quietly). */
const MISSES_TO_SAY = 3

interface WaitingProps {
  preview: InvitationPreview
  entry: LobbyEntry
  accessToken: string
  anonymous: boolean
  onIn: (e: LobbyEntry) => void
}

/**
 * The lobby from the outside: a quiet wait that ends as soon as someone inside decides. Each poll uses the
 * session's current token, so a wait longer than a token's life still ends in the room.
 */
function Waiting({ preview, entry, accessToken, anonymous, onIn }: WaitingProps) {
  const [current, setCurrent] = useState(entry)
  const [misses, setMisses] = useState(0)
  useEffect(() => {
    if (current.status !== 'waiting') return undefined
    const t = setInterval(() => {
      void currentToken(accessToken)
        .then((fresh) => getLobbyEntry(fresh, current.id))
        .then((next) => {
          setMisses(0)
          return next.status === 'admitted' ? onIn(next) : setCurrent(next)
        })
        .catch(() => setMisses((n) => n + 1)) // retried by the next poll
    }, POLL_MS)
    return () => clearInterval(t)
  }, [accessToken, current, onIn])
  useDocumentTitle(current.status === 'denied' ? null : 'Waiting to be let in · Sophia')
  if (current.status === 'denied') return <Denied preview={preview} anonymous={anonymous} />
  return (
    <Centered title={`Waiting to be let in, ${current.displayName}`} busy>
      <p>
        You’re in the lobby of “{preview.projectTitle}”. Keep this tab open: it changes the moment someone lets you in.
      </p>
      {misses >= MISSES_TO_SAY && <p className="form-error">Can’t reach Sophia right now. Still trying…</p>}
      <SessionNote preview={preview} />
    </Centered>
  )
}

/** A guest turned away: the visit ends here. */
function Denied({ preview, anonymous }: { preview: InvitationPreview; anonymous: boolean }) {
  return (
    <VisitEnd
      title="Not this time"
      body={`Someone in “${preview.projectTitle}” didn’t let you in. If that seems wrong, ask ${inviter(preview)}.`}
      anonymous={anonymous}
    />
  )
}

interface MemberProps {
  preview: InvitationPreview
  token: string
  identity: Identity | null
  onChooseDev: (identity: Identity) => void
  onSignOut: () => void
  onOpenProject: (projectId: string) => void
}

/** Signed in with another email than the invitation's: only that address can accept it (Supabase names by email). */
const otherAccount = (identity: Identity, email: string | null) =>
  authMode === 'supabase' && !!email && identity.name.toLowerCase() !== email.toLowerCase()

function MemberJoin({ preview, token, identity, onChooseDev, onSignOut, onOpenProject }: MemberProps) {
  const role = preview.role === 'viewer' ? 'a viewer' : 'an editor'
  const title = `${inviter(preview)} invited you to “${preview.projectTitle}”`
  if (!identity) {
    return (
      <Centered title={title}>
        <p>
          You’ll join as {role}. Sign in with {preview.email}; the invitation is only for that address.
        </p>
        {authMode === 'dev' ? <DevPicker onChoose={onChooseDev} /> : <InvitedSignIn email={preview.email ?? ''} />}
      </Centered>
    )
  }
  if (otherAccount(identity, preview.email)) {
    return (
      <Centered title={title}>
        <p>
          This invitation is for {preview.email}; you’re signed in as {identity.name}.
        </p>
        <button type="button" className="pill primary" onClick={onSignOut}>
          Sign out and continue as {preview.email}
        </button>
      </Centered>
    )
  }
  return (
    <Centered title={title}>
      <p>
        You’ll join as {role}, signed in as {identity.name}.
      </p>
      <SessionNote preview={preview} />
      <Accept token={token} identity={identity} onOpenProject={onOpenProject} />
    </Centered>
  )
}

function Accept({
  token,
  identity,
  onOpenProject,
}: {
  token: string
  identity: Identity
  onOpenProject: (projectId: string) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const accept = async () => {
    setBusy(true)
    try {
      const { projectId } = await acceptInvitation(identity.token, token)
      forgetJoinToken()
      onOpenProject(projectId)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not accept the invitation.')
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" className="pill primary" disabled={busy} onClick={() => void accept()}>
        {busy ? 'Joining…' : 'Accept and open the project'}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

function InvitedSignIn({ email }: { email: string }) {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const send = async () => {
    try {
      await sendInvitedSignIn(email)
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send the code.')
    }
  }
  if (sent) {
    return (
      <>
        <p className="muted">
          We sent a code to {email}.{' '}
          <button type="button" className="text-button" onClick={() => void send()}>
            Send it again
          </button>
        </p>
        <CodeForm email={email} />
      </>
    )
  }
  return (
    <>
      <button type="button" className="pill primary" onClick={() => void send()}>
        Email me a sign-in code
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}

/** Local stack: pick the synthetic person the invitation was sent to. */
function DevPicker({ onChoose }: { onChoose: (identity: Identity) => void }) {
  return (
    <div className="identity-grid">
      {devIdentities
        .filter((i) => i.role !== 'guest')
        .map((i) => (
          <button key={i.name} type="button" onClick={() => onChoose(i)}>
            <strong>{i.name}</strong>
            <span className="muted">{i.role === 'none' ? 'not a member' : i.role}</span>
          </button>
        ))}
    </div>
  )
}
