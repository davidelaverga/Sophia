// The people in the room, seated around Sophia's light: warm light for people, violet for her. The one
// who holds the floor carries a warm ring; a new holder's ring ignites once when the floor lands. A line says
// only what sets someone apart (the floor, speaking, a guest, a listener); a muted microphone is its icon.
import { Icon } from '@sophia/ui'
import { presenceRole, presenceSlots, shortName, type FloorView, type RoomParticipant } from './room-view.ts'

interface Props {
  people: RoomParticipant[]
  floor: FloorView
  /** The room revision: the holder's ignite ring replays whenever it changes. */
  revision: number
}

const initial = (name: string) => shortName(name).charAt(0)

/** A listener has no microphone to mute; anyone else muted shows it beside their name. */
const muted = (person: RoomParticipant) => !person.micOn && person.standing !== 'viewer'

export function Presences({ people, floor, revision }: Props) {
  const slots = presenceSlots(people.length)
  return (
    <ul className="presences" aria-label="In the room">
      {people.map((person, i) => {
        const slot = slots[i] ?? { side: 'left', row: 0 }
        const holds = floor.holder?.identity === person.identity
        const line = presenceRole(person, holds)
        return (
          <li
            key={person.identity}
            className="presence"
            data-side={slot.side}
            data-actor={person.identity}
            data-floor={holds || undefined}
            data-speaking={person.speaking || undefined}
            style={{ '--row': slot.row }}
          >
            <span className="orbit" data-anchor>
              {initial(person.name)}
              {holds && <span key={revision} className="ignite" aria-hidden />}
            </span>
            <span className="who">
              <span className="name">
                {shortName(person.name)}
                {person.local && <span className="you"> · you</span>}
                {muted(person) && (
                  <span className="muted-mic">
                    <Icon name="micOff" size={12} />
                    <span className="sr-only">muted</span>
                  </span>
                )}
              </span>
              {line && <span className="role">{line}</span>}
            </span>
            <span className="meter" aria-hidden>
              <i />
              <i />
              <i />
              <i />
            </span>
          </li>
        )
      })}
    </ul>
  )
}
