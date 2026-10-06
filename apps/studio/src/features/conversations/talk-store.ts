// What a person has under way in a project's conversations (docs/plans/project-conversation-follow-ups.md), kept per
// project and account while the Studio is open, whatever is on screen: the view goes on a trip to Work or the room,
// and coming back finds it all. Each draft; each message on its way, or sent with no reply (its key and its words);
// a refusal that answered one meanwhile; since when Sophia was asked; and the start's words and intent. Forgotten on
// signing out or switching identity (App), as the cached reads are.
import { useCallback, useSyncExternalStore } from 'react'
import type { ConversationAsk, MessageAsk } from '../../api/vision.ts'
import type { Held } from './held-write.ts'

export interface Kept {
  drafts: Readonly<Record<string, string>>
  holds: Readonly<Record<string, Held<MessageAsk> | null>>
  /** The words of a refusal that answered a write, by conversation (or START for the form), until the next press. */
  refusals: Readonly<Record<string, string | null>>
  /** Since when Sophia was asked to answer there, by conversation. */
  asked: Readonly<Record<string, string | null>>
  start: { fields: ConversationAsk; held: Held<ConversationAsk> | null }
}

/** The form's own place among the refusals. */
export const START = '#start'

export const NO_WORDS: ConversationAsk = { title: '', text: '', askSophia: true }

const EMPTY: Kept = { drafts: {}, holds: {}, refusals: {}, asked: {}, start: { fields: NO_WORDS, held: null } }

const kept = new Map<string, Kept>()
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Changes what is kept for one project and account; everyone reading it reads it again. */
export function changeKept(place: string, change: (was: Kept) => Kept): void {
  kept.set(place, change(kept.get(place) ?? EMPTY))
  for (const listener of listeners) listener()
}

/** Everything kept goes (signing out, another identity). */
export function forgetKept(): void {
  kept.clear()
  for (const listener of listeners) listener()
}

/** What is kept for this project and account, and how to change it. */
export function useKept(projectId: string, name: string) {
  const place = `${projectId} ${name}`
  const value = useSyncExternalStore(subscribe, () => kept.get(place) ?? EMPTY)
  const change = useCallback((f: (was: Kept) => Kept) => changeKept(place, f), [place])
  return { kept: value, change }
}

/** A record with one entry changed. */
export const withEntry = <T>(was: Readonly<Record<string, T>>, key: string, value: T): Readonly<Record<string, T>> => ({
  ...was,
  [key]: value,
})
