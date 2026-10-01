// The epoch a personal write is made against (A10): the epoch of the view it was made from. The space's, when it is
// shown: what is written comes from it, so what a space shown from before an erasure writes is refused, though the Work
// list may already name the newer epoch (the space is read again then). Else the Work list's: it writes while the space
// stays unread (locked). With neither read, a space never erased is at 0.
import type { PersonalSpace, ProjectList } from '@sophia/contracts'

export const epochNow = (
  space: Pick<PersonalSpace, 'epoch'> | undefined,
  work: Pick<ProjectList, 'personalEpoch'> | undefined,
): number => space?.epoch ?? work?.personalEpoch ?? 0

/**
 * An erasure this page hasn't read yet: the Work list, read every 20 s, names a newer epoch than the space shown. The
 * space is read again then, and goes with its draft.
 */
export const erasedElsewhere = (
  space: Pick<PersonalSpace, 'epoch'> | undefined,
  work: Pick<ProjectList, 'personalEpoch'> | undefined,
): boolean => space !== undefined && work !== undefined && work.personalEpoch > space.epoch
