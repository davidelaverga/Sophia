// The people in the room, seated around Sophia's light: warm light for people, violet for her. The one
// who holds the floor carries a warm ring; a new holder's ring ignites once when the floor lands.
import { presenceSlots, shortName, type FloorView, type RoomParticipant } from './room-view.ts'

interface Props {
  people: RoomParticipant[]
  floor: FloorView
  /** The room revision: the holder's ignite ring replays whenever it changes. */
  revision: number
}

const initial = (name: string) => shortName(name).charAt(0)

function role(person: RoomParticipant, holds: boolean): string {
  if (holds) return 'has the floor'
  if (person.speaking) return 'speaking'
  if (person.standing === 'guest') return person.micOn ? 'guest' : 'guest · muted'
  if (person.standing === 'viewer') return 'listening'
  return person.micOn ? 'in the room' : 'muted'
}

export function Presences({ people, floor, revision }: Props) {
  const slots = presenceSlots(people.length)
  return (
    <ul className="presences" aria-label="In the room">
      {people.map((person, i) => {
        const slot = slots[i] ?? { side: 'left', row: 0 }
        const holds = floor.holder?.identity === person.identity
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
              </span>
              <span className="role">{role(person, holds)}</span>
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
