// Text mode stays quiet (docs/plans/text-mode-quiet.md): while the call reads Sophia, her voice has no element to play
// in, so nothing can unmute it. LiveKit's startAudio unmutes every element it has (the dock's «Allow audio», and on
// iPhone and iPad each time the page shows again). Her tracks stay subscribed: her signal reads them, not an element.

/** Her voice's tracks, and whether the call reads her: each track plays while she is heard, none while she is read. */
export function sophiaVoice<T>(sound: { attach: (track: T) => void; detach: (track: T) => void }) {
  const tracks = new Set<T>()
  let read = false
  return {
    /** One of her tracks arrives: heard, it plays; read, it waits. */
    add: (track: T) => {
      tracks.add(track)
      if (!read) sound.attach(track)
    },
    /** One of her tracks left (its element goes with it, as any track's). */
    remove: (track: T) => {
      tracks.delete(track)
    },
    /** Text mode on: what plays leaves the page; off: it plays again. */
    setRead: (on: boolean) => {
      if (on === read) return
      read = on
      for (const track of tracks) {
        if (on) sound.detach(track)
        else sound.attach(track)
      }
    },
  }
}
