// Keep the call in view (docs/plans/call-picture-in-picture.md): what the small window shows, and which of the
// browser's two ways it takes. Pure, so the rules are unit-tested; CallPip.tsx asks the browser.
import { screenCaption, shortName, type RoomParticipant } from './room-view.ts'

interface Feed {
  identity: string
  source: 'camera' | 'screen'
}

export interface PipShown<F extends Feed> {
  person: RoomParticipant
  /** Their screen, or their camera; none, and their initial shows. */
  feed: F | undefined
  /** As the stage captions it: «Marco’s screen», «Marco», «Ana · you». */
  caption: string
}

/**
 * The stage's one view: a shared screen (the newest, as the stage shows it); else the one speaking, another before you;
 * else another with a camera; else another; you last, only when alone. Null with nobody in the call.
 */
export function pipShows<F extends Feed>(people: readonly RoomParticipant[], feeds: readonly F[]): PipShown<F> | null {
  const screen = feeds.findLast((f) => f.source === 'screen')
  const presenter = screen && people.find((p) => p.identity === screen.identity)
  if (screen && presenter) return { person: presenter, feed: screen, caption: screenCaption(presenter) }
  const camera = (p: RoomParticipant) => feeds.find((f) => f.identity === p.identity && f.source === 'camera')
  const others = people.filter((p) => !p.local)
  // You last, only when alone: in a call of two the window never flips to you when you talk.
  const person = others.find((p) => p.speaking) ?? others.find((p) => camera(p)) ?? others[0] ?? people[0]
  if (!person) return null
  const name = shortName(person.name)
  return { person, feed: camera(person), caption: person.local ? `${name} · you` : name }
}

export type PipWay = 'document' | 'video' | null

/**
 * Document Picture-in-Picture where the browser has it (Chromium); else video picture in picture, which needs a video
 * on the stage to put in it; else none, and the dock offers nothing.
 */
export function pipWay(has: { document: boolean; video: boolean }, stageVideo: boolean): PipWay {
  if (has.document) return 'document'
  return has.video && stageVideo ? 'video' : null
}
