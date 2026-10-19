// The call's sound as this browser plays it (docs/plans/sound-blocked-others.md). A browser that blocks autoplay
// (Safari, a join without a recent press) keeps every voice silent until the person allows it, so whoever speaks, not
// only Sophia, goes unheard while their tile lights. Pure, so the rules are unit-tested; the dock only renders them.
import type { SophiaView } from './sophia-view.ts'
import type { ProjectRoom } from './useProjectRoom.ts'

/** The dock's line, before its Allow audio. */
export const SOUND_BLOCKED = 'This browser blocked the call’s sound.'

/** What the view reads of the room. */
export type SoundRoom = Pick<ProjectRoom, 'status' | 'audioBlocked' | 'participants' | 'soundNoticeAway'>

export interface SoundView {
  /** The dock says the call's sound is blocked, with the one Allow audio. */
  notice: boolean
  /** Sophia's own Allow audio: she speaks into the block, and the dock's line doesn't already offer it. */
  sophiaAllow: boolean
}

/**
 * In the call (coming back too: the block is this browser's own), the sound blocked and someone else in it to hear: the
 * dock says so, unless the person put it away in this call. While it does, its Allow audio is the only one: LiveKit's
 * startAudio lets every voice through, hers too, and the line stays while she starts and stops speaking.
 */
export function soundView(room: SoundRoom, sophia: Pick<SophiaView, 'needsAudio'>): SoundView {
  const inCall = room.status === 'live' || room.status === 'reconnecting'
  const othersHere = room.participants.some((p) => !p.local)
  const notice = inCall && room.audioBlocked && othersHere && !room.soundNoticeAway
  return { notice, sophiaAllow: sophia.needsAudio && !notice }
}
