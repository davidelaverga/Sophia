// Others' cameras, taken or let go (docs/plans/incoming-video.md): off, this browser unsubscribes from each camera
// published to it, now and as more are published; a screen shared always comes. On again, it takes them back.

/**
 * One of the others' tracks, as LiveKit's publication: asked for (isDesired, the moment setSubscribed is called, and
 * by auto-subscribe as it is published) or let go.
 */
interface Publication {
  readonly source: string
  readonly isDesired: boolean
  setSubscribed: (on: boolean) => void
}

/** The switch, over the publications this browser has now; `onChange` has the room read again. */
export function incomingCameras<P extends Publication>(publications: () => Iterable<P>, onChange: () => void) {
  let on = true
  /**
   * Compared with what was asked for, not with what is here (isSubscribed): a camera still on its way is let go by Off
   * too, as people-volume's sounds are (Codex P2 on #424, livekit-room-follow-ups.md).
   */
  const apply = (pub: P) => {
    if (pub.source === 'camera' && pub.isDesired !== on) pub.setSubscribed(on)
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
