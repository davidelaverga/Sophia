// The name and picture a person brought from their account provider (Google, GitHub), for display only.
// Identity.name stays the email: it keys recent projects, cached queries and view state, so it never changes
// when someone edits their Google name.

export interface Profile {
  /** A human name, or null when the provider sent none (email sign-in). */
  displayName: string | null
  /** An https picture URL, or null. */
  avatarUrl: string | null
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Only https pictures: a data: or javascript: URL from metadata never reaches an <img>. */
function httpsUrl(v: unknown): string | null {
  const s = text(v)
  if (!s) return null
  try {
    return new URL(s).protocol === 'https:' ? s : null
  } catch {
    return null
  }
}

/**
 * Supabase keeps the provider's claims in user_metadata. Google sends full_name/name and avatar_url/picture;
 * GitHub sends full_name/name, user_name and avatar_url. A name equal to the email adds nothing, so it's dropped.
 */
export function profileFromMetadata(metadata: unknown, email: string | undefined): Profile {
  const m = new Map<string, unknown>(typeof metadata === 'object' && metadata !== null ? Object.entries(metadata) : [])
  const name =
    text(m.get('full_name')) ?? text(m.get('name')) ?? text(m.get('user_name')) ?? text(m.get('preferred_username'))
  const displayName = name && name.toLowerCase() !== email?.toLowerCase() ? name : null
  return { displayName, avatarUrl: httpsUrl(m.get('avatar_url')) ?? httpsUrl(m.get('picture')) }
}

/** The letter for an avatar without a picture: the name's first letter, else the email's. */
export function initialOf(displayName: string | null | undefined, email: string): string {
  return (displayName ?? email).trim().charAt(0).toUpperCase() || '?'
}
