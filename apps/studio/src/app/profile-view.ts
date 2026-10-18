// The words and rules of «Your name» (docs/plans/profile-editor.md): what a name may be, as the API checks it (0062),
// and what a read or a save that didn't go through says. Components only render these.
import { ApiError } from '../api/client.ts'

/** At most 60 characters, counted as the API counts them (code points). */
const FITS = /^.{1,60}$/su

/** Control, format and line-separator characters: invisible in a name, refused by the API (0062's display_name_ok). */
const HIDDEN: readonly (readonly [number, number])[] = [
  [0x00, 0x1f],
  [0x7f, 0x9f],
  [0xad, 0xad],
  [0x61c, 0x61c],
  [0x180e, 0x180e],
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x206f],
  [0xfeff, 0xfeff],
]

const hasHidden = (name: string): boolean => {
  for (const ch of name) {
    const at = ch.codePointAt(0) ?? 0
    if (HIDDEN.some(([from, to]) => at >= from && at <= to)) return true
  }
  return false
}

/** Why a name typed can't be saved, in words; null when it can (or when it is empty, which only waits). */
export function nameProblem(typed: string): string | null {
  const name = typed.trim()
  if (name === '') return null
  if (name.includes('@')) return 'A name, not an email address.'
  if (hasHidden(name)) return 'Use letters, numbers and spaces.'
  if (!FITS.test(name)) return 'At most 60 characters.'
  return null
}

/** Whether Save can run: a name that can be saved and isn't the one kept now. */
export const canSave = (typed: string, kept: string | null): boolean =>
  typed.trim() !== '' && nameProblem(typed) === null && typed.trim() !== (kept ?? '')

/** A read of the profile that didn't answer with one. */
export type ReadTrouble = 'unavailable' | 'signed_out' | 'failed'

/**
 * Why there is no profile to show: a server without the route (404, an API from before A32) says names can't be
 * changed here, never that there is no name; a refused account, to sign in again; anything else, to try again.
 */
export function readTrouble(err: unknown): ReadTrouble {
  if (err instanceof ApiError && err.status === 404) return 'unavailable'
  if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return 'signed_out'
  return 'failed'
}

export const READ_WORDS: Readonly<Record<ReadTrouble, string>> = {
  unavailable: 'Names can’t be changed here yet.',
  signed_out: 'Sign in again to change your name.',
  failed: 'Couldn’t read your name.',
}

/** What a save that was refused says, in place. A changed name elsewhere is a conflict, said apart (conflictWords). */
export function saveWords(err: ApiError, sent: string): string {
  if (err.status === 401 || err.status === 403) return READ_WORDS.signed_out
  if (err.status === 422) return nameProblem(sent) ?? 'That name can’t be used. Try letters, numbers and spaces.'
  return err.message
}

/** Someone (another tab, another device) changed the name since it was read: theirs now, the typed one kept. */
export const conflictWords = (now: string | null): string =>
  now ? `Changed elsewhere to «${now}». Save to use yours instead.` : 'Changed elsewhere. Save to use yours instead.'

/** A conflict whose current name couldn't be read: nothing is saved over a revision not read. */
export const CONFLICT_UNREAD = 'Changed elsewhere, and the new name couldn’t be read.'

/** Saved: who sees it, and when. */
export const SAVED_WORDS = 'Saved. People in your projects see it the next time their view loads.'
