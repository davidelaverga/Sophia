// The room's audio elements (livekit-room.ts): each voice it plays, Sophia's or a member's, has an element of its own,
// put on the page by the room and removed by it. A room that ends removes its own, never another's (a join that was
// superseded and left must not silence the call that replaced it). Apart from LiveKit, so a unit can drive it.

/** Whose voice an element plays, as the page marks it. */
export type Whose = 'sophia' | 'member'

/** A remote track, as LiveKit's: attach gives an element that plays it; detach lets go of one, or of all it has. */
export interface Playable<E> {
  attach(): E
  detach(): E[]
  detach(el: E): unknown
}

/** An audio element, as the page has it. */
interface AudioElement {
  remove: () => void
}

/** The elements this room plays its tracks in; `place` puts one on the page. */
export function audioElements<T extends Playable<E>, E extends AudioElement>(place: (el: E, whose: Whose) => void) {
  const trackOf = new Map<E, T>()
  /** One element out of the page: let go by its track and forgotten. */
  const drop = (el: E) => {
    trackOf.get(el)?.detach(el)
    trackOf.delete(el)
    el.remove()
  }
  return {
    /** The track plays in an element of its own, put on the page. */
    play: (track: T, whose: Whose) => {
      const el = track.attach()
      place(el, whose)
      trackOf.set(el, track)
      return el
    },
    drop,
    /** The elements the track lets go of leave the page; they are returned, for whoever else keeps them. */
    stop: (track: T) => {
      const gone = track.detach()
      for (const el of gone) drop(el)
      return gone
    },
    /** The call is over: every element this room put on the page leaves it. */
    clear: () => {
      for (const el of trackOf.keys()) el.remove()
      trackOf.clear()
    },
  }
}
