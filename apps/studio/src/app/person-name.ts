// One way to name a person (docs/plans/one-truth.md). The signed-in person is named by the name they chose
// (their profile, A32), then their provider's, then a dev identity's own, never by an address; anyone the Studio has
// no name for is one word, never an id. The room, the chat, Goals and Invite all fall back to the same word.

/** The one word for a person the Studio has no name for: a participant's empty name, a member the API names null. */
export const UNNAMED = 'A member'

/** An email address, as an account's name falls back to one: one word, an at sign, a domain with a dot. */
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const given = (name: string | null | undefined): string | null => {
  const trimmed = name?.trim()
  return trimmed && !ADDRESS.test(trimmed) ? trimmed : null
}

/**
 * The signed-in person's own name, whole: the one they saved («Your name», the first run), else their provider's,
 * else a dev identity's own. Null when there is none: an address is never a name.
 */
export function ownName(chosen: string | null | undefined, identity: { name: string; displayName?: string | null }) {
  return given(chosen) ?? given(identity.displayName) ?? given(identity.name)
}

/** A member as a list names them (Invite's people, a goal's owner): the name the API keeps, else the one word. */
export const memberName = (name: string | null | undefined): string => name?.trim() || UNNAMED
