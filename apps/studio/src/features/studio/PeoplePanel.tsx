// Everyone in the call, in the room's side panel (docs/plans/host-controls.md): you first, then the others, each with
// their role and whether their microphone is on. For an admin, each other member has a menu: mute their microphone
// while it is on (only they turn it on again), or take them out of the call (A24). A guest leaves by the door's Deny,
// so their row offers nothing. What changed shows as the call itself changes; a refusal is said on the row. While a
// control is on its way its row says so and its menu waits, so one press is one act.
import { useState } from 'react'
import { EmptyState, Icon, Menu, MenuItem, usePopover } from '@sophia/ui'
import { actInCall } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useMembership } from '../access/useAccess.ts'
import { shortName, type RoomParticipant, type Standing } from '../voice/room-view.ts'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'

interface Props {
  room: ProjectRoom
  projectId: string
  identity: Identity
}

type Act = 'mute' | 'remove'

const STANDING: Record<Standing, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
  guest: 'Guest',
  unknown: '',
}

/** What a refusal says, by the act and the person. */
const refusal = (what: Act, name: string) =>
  what === 'mute' ? `Couldn’t mute ${name}. Try again.` : `Couldn’t remove ${name} from the call. Try again.`

/** What the row says while a control is on its way. */
const underWay = (what: Act, name: string) => (what === 'mute' ? `Muting ${name}…` : `Removing ${name} from the call…`)

interface ActionsProps {
  person: RoomParticipant
  name: string
  /** A control for this person is on its way: the menu waits. */
  busy: boolean
  onAct: (what: Act) => void
}

/** An admin's menu on one member: Mute while their microphone is on, and Remove. */
function Actions({ person, name, busy, onAct }: ActionsProps) {
  const [open, setOpen] = useState(false)
  const menu = usePopover(open, () => setOpen(false))
  const label = `Actions for ${name}`
  // The chosen item leaves with the menu: the focus goes back to the opener first, as Escape's does.
  const choose = (what: Act) => () => {
    menu.opener.current?.focus()
    setOpen(false)
    onAct(what)
  }
  return (
    <span
      ref={menu.wrap}
      className="person-actions"
      // Esc closes this menu only: the side panel closes on an Esc that reaches it.
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !open) return
        e.stopPropagation()
        setOpen(false)
      }}
    >
      <button
        ref={menu.opener}
        type="button"
        className="round"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={busy || undefined}
        onClick={() => !busy && setOpen((o) => !o)}
      >
        <Icon name="more" />
      </button>
      {open && (
        <Menu popover={menu} label={label} side="bottom" align="end">
          {person.micOn && <MenuItem onClick={choose('mute')}>Mute microphone</MenuItem>}
          <MenuItem onClick={choose('remove')}>Remove from call</MenuItem>
        </Menu>
      )}
    </span>
  )
}

export function PeoplePanel({ room, projectId, identity }: Props) {
  const host = useMembership(projectId, identity.name, identity.token).data?.role === 'admin'
  const [failed, setFailed] = useState<{ identity: string; text: string } | null>(null)
  const [pending, setPending] = useState<ReadonlyMap<string, Act>>(new Map())
  // You first, then the others as the call lists them.
  const people = room.participants.toSorted((a, b) => Number(b.local) - Number(a.local))
  if (people.length === 0) return <EmptyState>Nobody is in the call yet.</EmptyState>
  const act = (person: RoomParticipant, name: string) => (what: Act) => {
    if (pending.has(person.identity)) return
    setFailed(null)
    setPending((was) => new Map(was).set(person.identity, what))
    actInCall(identity.token, projectId, person.identity, what)
      .catch(() => setFailed({ identity: person.identity, text: refusal(what, name) }))
      .finally(() =>
        setPending((was) => {
          const now = new Map(was)
          now.delete(person.identity)
          return now
        }),
      )
  }
  return (
    <ul className="people" aria-label="People in the call">
      {people.map((p) => {
        const name = shortName(p.name)
        const acts = host && !p.local && p.standing !== 'guest' && p.standing !== 'unknown'
        return (
          <li key={p.identity} className="person">
            <span className="person-name">{`${name}${p.local ? ' · you' : ''}`}</span>
            <span className="person-role">{STANDING[p.standing]}</span>
            <span role="img" className="person-mic" aria-label={p.micOn ? 'Microphone on' : 'Microphone off'}>
              <Icon name={p.micOn ? 'mic' : 'micOff'} />
            </span>
            {acts && <Actions person={p} name={name} busy={pending.has(p.identity)} onAct={act(p, name)} />}
            <Pending what={pending.get(p.identity)} name={name} />
            {failed?.identity === p.identity && (
              <p role="alert" className="person-failed">
                {failed.text}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Pending({ what, name }: { what: Act | undefined; name: string }) {
  if (!what) return null
  return (
    <p role="status" className="person-pending">
      {underWay(what, name)}
    </p>
  )
}
