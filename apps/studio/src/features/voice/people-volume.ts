// Each person's volume, for you alone (docs/plans/people-volume.md): the levels offered, and what they reach. A level
// is kept by person and put on each of their sounds, those playing and those to come. Off stops their sound coming,
// as «Show others' cameras» does for cameras: LiveKit's startAudio unmutes every sound it has (on iPhone and iPad,
// each time the page shows again), and a sound that doesn't come can't be unmuted. Until it stops, it plays muted at 0.

/** The levels a person's menu offers, loudest first; 0 is Off. */
export const LEVELS = [1, 0.75, 0.5, 0.25, 0] as const
export type Level = (typeof LEVELS)[number]

/** What a level says: «100%» … «Off». */
export const levelWords = (level: Level) => (level === 0 ? 'Off' : `${String(level * 100)}%`)

/** The levels a page can set: where a sound's volume is fixed (iPhone, iPad), only full and Off. */
export const levelsHere = (settable: boolean): readonly Level[] => (settable ? LEVELS : [1, 0])

/** A page can set a sound's volume: iPhone's and iPad's sounds read 1 whatever was set. */
export function volumeSettable(probe: { volume: number }): boolean {
  probe.volume = 0.5
  return probe.volume === 0.5
}

/** A sound playing here: an audio element. */
interface Sound {
  volume: number
  muted: boolean
}

/** A sound at a level; Off mutes it too, until its track stops coming. */
const put = (sound: Sound, level: Level) => {
  sound.volume = level
  sound.muted = level === 0
}

/** One of a person's tracks, as LiveKit's publication: asked for (isDesired, even before it is here) or let go. */
interface Track {
  readonly kind: string
  readonly isDesired: boolean
  setSubscribed: (on: boolean) => void
}

export type PeopleVolume = ReturnType<typeof peopleVolume>

/** The sounds and tracks of each person, and the level each was given here: full until set. */
export function peopleVolume() {
  const levels = new Map<string, Level>()
  const sounds = new Map<Sound, string>()
  const levelOf = (identity: string) => levels.get(identity) ?? 1
  /**
   * Their sound comes unless they are Off; their video is left alone. Compared with what was asked for, not with what
   * is here: a sound still on its way is let go by Off too (Codex P1 on #425).
   */
  const take = (track: Track, identity: string) => {
    const wanted = levelOf(identity) !== 0
    if (track.kind === 'audio' && track.isDesired !== wanted) track.setSubscribed(wanted)
  }
  return {
    /** A sound of theirs begins: it plays at the level they were given. */
    add: (sound: Sound, identity: string) => {
      sounds.set(sound, identity)
      put(sound, levelOf(identity))
    },
    remove: (sound: Sound) => {
      sounds.delete(sound)
    },
    /** A track of theirs is published: let go if they are Off; anyone else's is LiveKit's to take, as ever. */
    published: (track: Track, identity: string) => {
      if (track.kind === 'audio' && levelOf(identity) === 0) track.setSubscribed(false)
    },
    /** Their level, put on their sounds and their tracks. */
    set: (identity: string, level: Level, tracks: Iterable<Track>) => {
      levels.set(identity, level)
      for (const [sound, who] of sounds) if (who === identity) put(sound, level)
      for (const track of tracks) take(track, identity)
    },
  }
}
