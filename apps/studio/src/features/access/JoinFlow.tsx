// /join#<token>: someone opened an invitation link. The page says where it leads (a public preview), then
// either lets a guest ask to come in (their name, the lobby, the call) or signs an invited member in and adds
// them to the project. The token stays in the fragment and reaches the API only in request bodies.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { InvitationPreview, LobbyEntry } from '@sophia/contracts'
import { acceptInvitation, getLobbyEntry, knockRoom, previewInvitation } from '../../api/access.ts'
import { authMode, guestAccessToken, sendInvitedSignIn, type AuthState } from '../../app/auth.ts'
import { devIdentities, type Identity } from '../../app/dev-identity.ts'
import { Centered, CodeForm } from '../../app/SignIn.tsx'
import { countdown, readJoinToken, sessionLabel } from './access-view.ts'
import { GuestRoom } from './GuestRoom.tsx'

interface Props {
  auth: AuthState
  onChooseDev: (identity: Identity) => void
  onOpenProject: (projectId: string) => void
}

const CLOSED: Record<Exclude<InvitationPreview['state'], 'open'>, string> = {
  expired: 'This invitation has expired. Ask for a new link.',
  revoked: 'This link was closed by the room. Ask for a new one.',
  used_up: 'This link has been used as many times as it allows. Ask for a new one.',
}

/** The link's token, kept for this tab: a sign-in link from the email comes back to /join without it. */
const PENDING = 'sophia.join'

function joinToken(): string | null {
  const fromLink = readJoinToken(window.location.hash)
  try {
    if (fromLink) sessionStorage.setItem(PENDING, fromLink)
    return fromLink ?? readJoinToken(sessionStorage.getItem(PENDING) ?? '')
  } catch {
    return fromLink // storage unavailable: the link itself still works
  }
}

export function JoinFlow({ auth, onChooseDev, onOpenProject }: Props) {
  const [token] = useState(joinToken)
  const preview = useQuery({
    queryKey: ['join-preview', token],
    queryFn: () => previewInvitation(token ?? ''),
    enabled: !!token,
    retry: false,
  })
  if (!token) return <Closed text="This link is incomplete. Ask for the whole link, or a new one." />
  if (preview.isPending) return <Centered title="Opening the room…" busy />
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

/** A closed door still leads somewhere: Sophia's front page (sign-in, or your projects). */
function HomeLink() {
  return (
    <a className="pill" href="/">
      Go to Sophia
    </a>
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

function GuestJoin({
  preview,
  token,
  identity,
}: {
  preview: InvitationPreview
  token: string
  identity: Identity | null
}) {
  const [state, setState] = useState<GuestStep>({ step: 'name', error: null })
  const [name, setName] = useState('')
  const knock = async (e: React.FormEvent) => {
    e.preventDefault()
    setState({ step: 'knocking' })
    try {
      const accessToken = await guestAccessToken(identity)
      const entry = await knockRoom(accessToken, token, name.trim())
      setState({ step: entry.status === 'admitted' ? 'in' : 'waiting', entry, accessToken })
    } catch (err: unknown) {
      setState({ step: 'name', error: err instanceof Error ? err.message : 'Could not knock.' })
    }
  }
  if (state.step === 'in') {
    return <GuestRoom accessToken={state.accessToken} entry={state.entry} projectTitle={preview.projectTitle} />
  }
  if (state.step === 'waiting') {
    return (
      <Waiting
        preview={preview}
        entry={state.entry}
        accessToken={state.accessToken}
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
        onKnock={(e) => void knock(e)}
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

/** The lobby from the outside: a quiet wait that ends as soon as someone inside decides. */
function Waiting({
  preview,
  entry,
  accessToken,
  onIn,
}: {
  preview: InvitationPreview
  entry: LobbyEntry
  accessToken: string
  onIn: (e: LobbyEntry) => void
}) {
  const [current, setCurrent] = useState(entry)
  useEffect(() => {
    if (current.status !== 'waiting') return undefined
    const t = setInterval(() => {
      void getLobbyEntry(accessToken, current.id)
        .then((next) => (next.status === 'admitted' ? onIn(next) : setCurrent(next)))
        .catch(() => undefined) // a missed poll is retried by the next one
    }, POLL_MS)
    return () => clearInterval(t)
  }, [accessToken, current, onIn])
  if (current.status === 'denied') {
    return (
      <Centered title="Not this time">
        <p>The room did not let you in. You can ask whoever invited you.</p>
        <HomeLink />
      </Centered>
    )
  }
  return (
    <Centered title={`Waiting to be let in, ${current.displayName}`} busy>
      <p>Someone in “{preview.projectTitle}” will let you in. You can keep this page open.</p>
      <SessionNote preview={preview} />
    </Centered>
  )
}

interface MemberProps {
  preview: InvitationPreview
  token: string
  identity: Identity | null
  onChooseDev: (identity: Identity) => void
  onOpenProject: (projectId: string) => void
}

function MemberJoin({ preview, token, identity, onChooseDev, onOpenProject }: MemberProps) {
  const role = preview.role === 'viewer' ? 'a viewer' : 'an editor'
  const title = `${inviter(preview)} invited you to “${preview.projectTitle}”`
  if (!identity) {
    return (
      <Centered title={title}>
        <p>
          You would join as {role}. Sign in with {preview.email}; the invitation is only for that address.
        </p>
        {authMode === 'dev' ? <DevPicker onChoose={onChooseDev} /> : <InvitedSignIn email={preview.email ?? ''} />}
      </Centered>
    )
  }
  return (
    <Centered title={title}>
      <p>
        You would join as {role}, signed in as {identity.name}.
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
      onOpenProject((await acceptInvitation(identity.token, token)).projectId)
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
  if (sent) return <CodeForm email={email} />
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
