// A report shown to everyone (docs/plans/room-present.md): which version the room's focus names, what the card says,
// and when the stage presents it. Pure, so the rules are unit-tested and React only renders them.
import type { ArtifactVersion, Snapshot } from '@sophia/contracts'

export interface Shown {
  /** The version shown, found among the snapshot's current versions; null when it isn't one of them. */
  version: ArtifactVersion | null
  guideId: string
  /** The focus's revision: one more with each change of what is shown, or by whom. */
  revision: number
  /** I am the one showing it. */
  mine: boolean
}

/** What the room's focus shows, if anything, resolved against the snapshot's current versions. */
export function shownOf(
  focus: Snapshot['sharedFocus'] | undefined,
  artifacts: readonly ArtifactVersion[] | undefined,
  me: string,
): Shown | null {
  if (!focus) return null
  const version = artifacts?.find((v) => v.id === focus.artifactVersionId) ?? null
  return { version, guideId: focus.guideId, revision: focus.revision, mine: focus.guideId === me }
}

/** The card's words: who shows what; mine when I show it. */
export function showingWords(
  guide: string,
  version: Pick<ArtifactVersion, 'title' | 'versionNumber'> | null,
  mine = false,
): string {
  const who = mine ? 'You are' : `${guide} is`
  if (!version) return `${who} showing an earlier version of a report`
  const number = version.versionNumber ? ` · v${String(version.versionNumber)}` : ''
  return `${who} showing ${version.title ?? 'a report'}${number}`
}

/** What I chose to follow: the focus at its revision, with the version it showed. */
export interface Followed {
  revision: number
  versionId: string
  guideId: string
}

/**
 * I follow what is shown only while it is what I chose: the focus at that revision. Any change of it (another report,
 * another member showing, even the same one shown again) asks again; only Sophia walking it carries it (carriesOver).
 */
export const follows = (followed: Followed | null, shown: Shown | null): boolean =>
  !!followed && !!shown && shown.revision === followed.revision && shown.version?.id === followed.versionId

/** What the room's focus read says (A14's proposed read): enough to tell Sophia's walk from a new showing. */
export interface FocusAt {
  revision: number
  artifactVersionId: string | null
  by: 'member' | 'sophia'
  /** The revision the current showing began at (its member's show): her walks after it don't move it. */
  shownAt: number
}

/** The focus moved on from what I follow, within the same showing: whether it was Sophia walking it is worth asking. */
export const mayCarry = (followed: Followed | null, shown: Shown | null): boolean =>
  !!followed &&
  !!shown &&
  shown.revision > followed.revision &&
  shown.guideId === followed.guideId &&
  shown.version?.id === followed.versionId

/**
 * Sophia walked what I follow to another section (A14): the focus's new revision is hers, on the same version, in
 * the very showing I chose (it began no later than my follow, so no member showed it again between, even in one
 * snapshot). Following carries over to it; anything else at that revision asks again.
 */
export function carriesOver(followed: Followed | null, shown: Shown | null, at: FocusAt | undefined): boolean {
  if (!followed || !shown || !at || !mayCarry(followed, shown)) return false
  const hers = at.revision === shown.revision && at.by === 'sophia' && at.artifactVersionId === followed.versionId
  return hers && at.shownAt <= followed.revision
}

/**
 * The stage presents the report when I follow it, or show it myself; never while a screen is shared (live media keeps
 * the stage), nor a version it can't find.
 */
export const presenting = (shown: Shown | null, at: { following: boolean; screen: boolean }): boolean =>
  !!shown?.version && !at.screen && (shown.mine || at.following)

/** «Show everyone» calls the proposed A14 writer: only under the vision flag, to a member in the call. */
export const showOffered = (at: { vision: boolean; inCall: boolean; guest: boolean }): boolean =>
  at.vision && at.inCall && !at.guest
