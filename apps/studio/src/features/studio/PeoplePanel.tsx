// Everyone in the call, in the room's side panel (docs/plans/host-controls.md): you first, then the others, each with
// their role and whether their microphone is on. For an admin, each other member has a menu: mute their microphone
// while it is on (only they turn it on again), or take them out of the call (A24). A guest leaves by the door's Deny,
// so their row offers no such menu. What changed shows as the call itself changes; a refusal is said on the row. While
// a control is on its way its row says so and its menu waits, so one press is one act. Everyone can turn each other
// person down for themselves alone (people-volume.md).
import { useRef, useState, type KeyboardEvent } from 'react'
import { ConfirmButton, EmptyState, Icon, Menu, MenuHead, MenuItem, Tip, usePopover } from '@sophia/ui'
import { actInCall, muteEveryoneInCall } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { SLOW_NOTE, useSlow } from '../../app/useSlow.ts'
import { useMembership } from '../access/useAccess.ts'
import { levelsHere, levelWords, volumeSettable, type Level } from '../voice/people-volume.ts'
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

/** A row's menu (an admin's actions, a person's volume): Esc closes it alone, and a choice hands the focus back first. */
function useRowMenu() {
  const [open, setOpen] = useState(false)
  const menu = usePopover(open, () => setOpen(false))
  return {
    open,
    menu,
    toggle: () => setOpen((o) => !o),
    // The chosen item leaves with the menu: the focus goes back to the opener first, as Escape's does.
    choose: (then: () => void) => () => {
      menu.opener.current?.focus()
      setOpen(false)
      then()
    },
    // Esc closes this menu only: the side panel closes on an Esc that reaches it.
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !open) return
      e.stopPropagation()
      setOpen(false)
    },
  }
}

/** An admin's menu on one member: Mute, Turn off camera and Stop screen sharing while each is on, and Remove. */
function Actions({ person, name, busy, onAct }: ActionsProps) {
  const row = useRowMenu()
  const label = `Actions for ${name}`
  return (
    <span ref={row.menu.wrap} className="person-actions" onKeyDown={row.onKeyDown}>
      <button
        ref={row.menu.opener}
        type="button"
        className="round"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={row.open}
        aria-disabled={busy || undefined}
        onClick={() => !busy && row.toggle()}
      >
        <Icon name="more" />
      </button>
      {row.open && (
        <Menu popover={row.menu} label={label} side="bottom" align="end">
          {person.micOn && <MenuItem onClick={row.choose(() => onAct('mute'))}>Mute microphone</MenuItem>}
          {person.cameraOn && <MenuItem onClick={row.choose(() => onAct('stop-camera'))}>Turn off camera</MenuItem>}
          {person.screenOn && <MenuItem onClick={row.choose(() => onAct('stop-screen'))}>Stop screen sharing</MenuItem>}
          <MenuItem onClick={row.choose(() => onAct('remove'))}>Remove from call</MenuItem>
        </Menu>
      )}
    </span>
  )
}

interface VolumeProps {
  name: string
  level: Level
  /** The levels this browser can set (people-volume.ts, `levelsHere`). */
  levels: readonly Level[]
  onLevel: (level: Level) => void
}

/** How loud this person is for you alone (people-volume.md): a menu of levels; turned down, the level is in the speaker's place. */
function Volume({ name, level, levels, onLevel }: VolumeProps) {
  const row = useRowMenu()
  const label = `Volume for ${name}`
  return (
    <span ref={row.menu.wrap} className="person-volume" onKeyDown={row.onKeyDown}>
      <button
        ref={row.menu.opener}
        type="button"
        className="round has-tip"
        aria-label={`${label}: ${levelWords(level)}`}
        aria-haspopup="menu"
        aria-expanded={row.open}
        onClick={row.toggle}
      >
        {level === 1 || level === 0 ? (
          <Icon name={level === 0 ? 'speakerOff' : 'speaker'} />
        ) : (
          <span className="person-volume-level" aria-hidden>
            {levelWords(level)}
          </span>
        )}
        {!row.open && <Tip label={label} side="bottom" align="end" />}
      </button>
      {row.open && (
        <Menu popover={row.menu} label={label} side="bottom" align="end">
          <MenuHead>For you alone</MenuHead>
          {levels.map((l) => (
            <MenuItem key={l} checked={l === level} onClick={row.choose(() => onLevel(l))}>
              {levelWords(l)}
            </MenuItem>
          ))}
        </Menu>
      )}
    </span>
  )
}

interface RowProps {
  person: RoomParticipant
  host: boolean
  level: Level
  levels: readonly Level[]
  /** The control on its way for this person, if any: the menu waits. */
  pending: Act | undefined
  failed: string | null
  onAct: (what: Act) => void
  onLevel: (level: Level) => void
}

/** One person in the call: name, role and microphone; for the others, their volume; for an admin, a member's acts. */
function PersonRow({ person: p, host, level, levels, pending, failed, onAct, onLevel }: RowProps) {
  const name = shortName(p.name)
  const acts = host && !p.local && p.standing !== 'guest' && p.standing !== 'unknown'
  return (
    <li className="person">
      <span className="person-name">{`${name}${p.local ? ' · you' : ''}`}</span>
      <span className="person-role">{STANDING[p.standing]}</span>
      <span role="img" className="person-mic" aria-label={p.micOn ? 'Microphone on' : 'Microphone off'}>
        <Icon name={p.micOn ? 'mic' : 'micOff'} />
      </span>
      {!p.local && <Volume name={name} level={level} levels={levels} onLevel={onLevel} />}
      {acts && <Actions person={p} name={name} busy={pending !== undefined} onAct={onAct} />}
      {pending && <Pending what={pending} name={name} />}
      {failed && (
        <p role="alert" className="person-failed">
          {failed}
        </p>
      )}
    </li>
  )
}

export function PeoplePanel({ room, projectId, identity }: Props) {
  const host = useMembership(projectId, identity.name, identity.token).data?.role === 'admin'
  const [failed, setFailed] = useState<{ identity: string; text: string } | null>(null)
  const [pending, setPending] = useState<ReadonlyMap<string, Act>>(new Map())
  const list = useRef<HTMLUListElement>(null)
  const [levels] = useState(() => levelsHere(volumeSettable(document.createElement('audio'))))
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
        {people.map((p) => (
          <PersonRow
            key={p.identity}
            person={p}
            host={host}
            level={room.volumes.get(p.identity) ?? 1}
            levels={levels}
            pending={pending.get(p.identity)}
            failed={failed?.identity === p.identity ? failed.text : null}
            onAct={act(p, shortName(p.name))}
            onLevel={(level) => room.setVolume(p.identity, level)}
          />
        ))}
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
      <ConfirmButton
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
