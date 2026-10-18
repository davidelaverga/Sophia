// Others' cameras, taken or let go (docs/plans/incoming-video.md): off, this browser unsubscribes from each camera
// published to it, now and as more are published; a screen shared always comes. On again, it takes them back.

/** One of the others' tracks, as LiveKit's publication. */
interface Publication {
  readonly source: string
  readonly isSubscribed: boolean
  setSubscribed: (on: boolean) => void
}

/** The switch, over the publications this browser has now; `onChange` has the room read again. */
export function incomingCameras<P extends Publication>(publications: () => Iterable<P>, onChange: () => void) {
  let on = true
  const apply = (pub: P) => {
    if (pub.source === 'camera' && pub.isSubscribed !== on) pub.setSubscribed(on)
  }
  return {
    /** A camera published while they're off isn't taken; one published while they're on is LiveKit's to take, as ever. */
    published: (pub: P) => {
      if (!on) apply(pub)
    },
    set: (next: boolean) => {
      on = next
      for (const pub of publications()) apply(pub)
      onChange()
    },
  }
}
