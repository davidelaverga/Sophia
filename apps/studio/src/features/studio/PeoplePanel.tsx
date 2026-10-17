// Everyone in the call, in the room's side panel (docs/plans/host-controls.md): you first, then the others, each with
// their role and whether their microphone is on. For an admin, each other member has a menu: mute their microphone
// while it is on (only they turn it on again), or take them out of the call (A24). A guest leaves by the door's Deny,
// so their row offers no such menu. What changed shows as the call itself changes; a refusal is said on the row. While
// a control is on its way its row says so and its menu waits, so one press is one act. Everyone can turn each other
// person down for themselves alone (people-volume.md).
import { useState, type KeyboardEvent } from 'react'
import { EmptyState, Icon, Menu, MenuHead, MenuItem, Tip, usePopover } from '@sophia/ui'
import { actInCall } from '../../api/client.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useMembership } from '../access/useAccess.ts'
import { levelsHere, levelWords, volumeSettable, type Level } from '../voice/people-volume.ts'
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

/** An admin's menu on one member: Mute while their microphone is on, and Remove. */
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

/** How loud this person is for you alone (people-volume.md): a menu of levels, the level on a tag when it isn't full. */
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
        <Icon name={level === 0 ? 'speakerOff' : 'speaker'} />
        {level !== 1 && (
          <span className="person-volume-level" aria-hidden>
            {levelWords(level)}
          </span>
        )}
        {!row.open && <Tip label={label} side="bottom" align="end" />}
      </button>
      {row.open && (
        <Menu popover={row.menu} label={label} side="bottom" align="end">
          <MenuHead>Only you hear the change</MenuHead>
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

export function PeoplePanel({ room, projectId, identity }: Props) {
  const host = useMembership(projectId, identity.name, identity.token).data?.role === 'admin'
  const [failed, setFailed] = useState<{ identity: string; text: string } | null>(null)
  const [pending, setPending] = useState<ReadonlyMap<string, Act>>(new Map())
  const [levels] = useState(() => levelsHere(volumeSettable(document.createElement('audio'))))
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
            {!p.local && (
              <Volume
                name={name}
                level={room.volumes.get(p.identity) ?? 1}
                levels={levels}
                onLevel={(level) => room.setVolume(p.identity, level)}
              />
            )}
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
