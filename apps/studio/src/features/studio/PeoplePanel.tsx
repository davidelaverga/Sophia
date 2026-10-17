// Everyone in the call, in the room's side panel (docs/plans/host-controls.md): you first, then the others, each with
// their role and whether their microphone is on. For an admin, each other member has a menu: mute their microphone
// while it is on (only they turn it on again), or take them out of the call (A24). A guest leaves by the door's Deny,
// so their row offers nothing. What changed shows as the call itself changes; a refusal is said on the row. While a
// control is on its way its row says so and its menu waits, so one press is one act.
import { useRef, useState } from 'react'
import { Button, buttonClass, ConfirmButton, EmptyState, Icon, Menu, MenuItem, usePopover } from '@sophia/ui'
import { actInCall, muteEveryoneInCall } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { useMembership } from '../access/useAccess.ts'
import { shortName, type RoomParticipant, type Standing } from '../voice/room-view.ts'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'

interface Props {
  room: ProjectRoom
  projectId: string
  identity: Identity
}

type Act = 'mute' | 'remove' | 'stop-camera' | 'stop-screen'

const STANDING: Record<Standing, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
  guest: 'Guest',
  unknown: '',
}

/** What a refusal says, by the act and the person. */
const REFUSAL: Record<Act, (name: string) => string> = {
  mute: (name) => `Couldn’t mute ${name}. Try again.`,
  remove: (name) => `Couldn’t remove ${name} from the call. Try again.`,
  'stop-camera': (name) => `Couldn’t turn off ${name}’s camera. Try again.`,
  'stop-screen': (name) => `Couldn’t stop ${name}’s screen sharing. Try again.`,
}
const refusal = (what: Act, name: string) => REFUSAL[what](name)

/** What the row says while a control is on its way. */
const UNDER_WAY: Record<Act, (name: string) => string> = {
  mute: (name) => `Muting ${name}…`,
  remove: (name) => `Removing ${name} from the call…`,
  'stop-camera': (name) => `Turning off ${name}’s camera…`,
  'stop-screen': (name) => `Stopping ${name}’s screen sharing…`,
}
const underWay = (what: Act, name: string) => UNDER_WAY[what](name)

interface ActionsProps {
  person: RoomParticipant
  name: string
  /** A control for this person is on its way: the menu waits. */
  busy: boolean
  onAct: (what: Act) => void
}

/** An admin's menu on one member: Mute, Turn off camera and Stop screen sharing while each is on, and Remove. */
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
      {/* The kit's 32 px square: it fills its column and ends where Close does (room-dock-people.md). */}
      <Button
        ref={menu.opener}
        kind="icon"
        size="md"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-disabled={busy || undefined}
        onClick={() => !busy && setOpen((o) => !o)}
      >
        <Icon name="more" />
      </Button>
      {open && (
        <Menu popover={menu} label={label} side="bottom" align="end">
          {person.micOn && <MenuItem onClick={choose('mute')}>Mute microphone</MenuItem>}
          {person.cameraOn && <MenuItem onClick={choose('stop-camera')}>Turn off camera</MenuItem>}
          {person.screenOn && <MenuItem onClick={choose('stop-screen')}>Stop screen sharing</MenuItem>}
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
  const list = useRef<HTMLUListElement>(null)
  // You first, then the others as the call lists them.
  const people = room.participants.toSorted((a, b) => Number(b.local) - Number(a.local))
  if (people.length === 0) return <EmptyState>Nobody is in the call yet.</EmptyState>
  const act = (person: RoomParticipant, name: string) => (what: Act) => {
    if (pending.has(person.identity)) return
    setFailed(null)
    setPending((was) => new Map(was).set(person.identity, what))
    actInCall(identity.token, projectId, person.identity, what)
      .then(() => {
        // Their row goes as they leave the call: the focus goes to the list, never the page (Codex P2 on #351).
        if (what === 'remove') requestAnimationFrame(() => list.current?.focus({ preventScroll: true }))
      })
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
    <>
      {host && <MuteEveryone people={people} projectId={projectId} identity={identity} />}
      <ul ref={list} className="people" aria-label="People in the call" tabIndex={-1}>
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
              {pending.has(p.identity) && <Pending what={pending.get(p.identity) ?? 'mute'} name={name} />}
              {failed?.identity === p.identity && (
                <p role="alert" className="person-failed">
                  {failed.text}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}

/**
 * «Mute everyone» (host-more.md, A31), for an admin while someone else's microphone is on: it asks first, then every
 * other microphone in the call goes off, guests' too; each turns their own back on.
 */
function MuteEveryone({
  people,
  projectId,
  identity,
}: {
  people: readonly RoomParticipant[]
  projectId: string
  identity: Identity
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'failed'>('idle')
  if (!people.some((p) => !p.local && p.micOn)) return null
  const mute = () => {
    setState('sending')
    muteEveryoneInCall(identity.token, projectId).then(
      () => setState('idle'),
      () => setState('failed'),
    )
  }
  return (
    <div className="people-head">
      {/* A press, not a heading: the kit's small pill (room-dock-people.md). */}
      <ConfirmButton
        className={buttonClass({ size: 'sm' })}
        label={state === 'sending' ? 'Muting everyone…' : 'Mute everyone'}
        warning="Everyone else’s microphone goes off; each turns their own back on."
        confirm="Mute them"
        keep="Cancel"
        disabled={state === 'sending'}
        onConfirm={mute}
      />
      {state === 'failed' && (
        <p role="alert" className="person-failed">
          Couldn’t mute everyone. Try again.
        </p>
      )}
    </div>
  )
}

/** A control on its way, and past six seconds, that it is slow, as every Studio write says (Codex P2 on #351). */
function Pending({ what, name }: { what: Act; name: string }) {
  const slow = useSlow(true)
  return (
    <p role="status" className="person-pending">
      {underWay(what, name)}
      {slow && ` ${SLOW_NOTE}`}
    </p>
  )
}
