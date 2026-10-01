// The epoch a personal write is made against (A10): the space's, moved by each erasure; Work reads it too, for what it
// writes while the personal space stays unread (locked). An epoch only moves forward, so the newer of the two is where
// the space is as far as this page knows; with neither read, a space never erased is at 0.
import type { PersonalSpace, ProjectList } from '@sophia/contracts'

export const epochNow = (
  space: Pick<PersonalSpace, 'epoch'> | undefined,
  work: Pick<ProjectList, 'personalEpoch'> | undefined,
): number => Math.max(space?.epoch ?? 0, work?.personalEpoch ?? 0)

/**
 * An erasure this page hasn't read yet: the Work list, read every 20 s, names a newer epoch than the space shown. The
 * space is read again then, and goes with its draft.
 */
export const erasedElsewhere = (
  space: Pick<PersonalSpace, 'epoch'> | undefined,
  work: Pick<ProjectList, 'personalEpoch'> | undefined,
): boolean => space !== undefined && work !== undefined && work.personalEpoch > space.epoch
