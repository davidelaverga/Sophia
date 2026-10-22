// A part of the call gone after a deploy (docs/plans/stale-part-call.md): an outline, written with its checks.

/** What the room says when its call's code is gone from the host: the tab is on an older version. */
export const STALE_PART = 'This tab is on an older version of Sophia, so the call couldn’t load.'

const notYet = (): never => {
  throw new Error('part-gone.ts: not written yet')
}

export const partGone = (_err: unknown, _heard: boolean): boolean => notYet()
export const joinMessage = (_err: unknown, _heard: boolean): string => notYet()
export const refusalOf = (_err: unknown, _heard: boolean): 'stale' | 'refused' => notYet()
