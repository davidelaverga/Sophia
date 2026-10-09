// What a person has under way in a project's conversations (docs/plans/project-conversation-follow-ups.md), kept per
// project and account while the Studio is open, whatever is on screen: the view goes on a trip to Work or the room,
// and coming back finds it all. Each draft; each message on its way, or sent with no reply (its key and its words);
// a refusal that answered one meanwhile; since when Sophia was asked; and the start's words and intent. Forgotten on
// signing out or switching identity (App), as the cached reads are.
import { useCallback, useSyncExternalStore } from 'react'
import type { ConversationAsk, MessageAsk } from '../../api/conversations.ts'
import type { Held } from './held-write.ts'

export interface Kept {
  drafts: Readonly<Record<string, string>>
  /** Whether each draft asks Sophia (on unless the person turned it off), kept with its words. */
  asks: Readonly<Record<string, boolean>>
  holds: Readonly<Record<string, Held<MessageAsk> | null>>
  /** The words of a refusal that answered a write, by conversation (or START for the form), until the next press. */
  refusals: Readonly<Record<string, string | null>>
  /** When Sophia was asked to answer there, by conversation. */
  asked: Readonly<Record<string, Asked | null>>
  start: { fields: ConversationAsk; held: Held<ConversationAsk> | null }
  /** A message's proposal on its way, or sent with no reply (its key and words), by message: never sent twice. */
  proposals: Readonly<Record<string, Held<string> | null>>
  /** The words of a refusal that answered a message's proposal, until its next press. */
  proposalRefusals: Readonly<Record<string, string | null>>
  /** A message whose proposal was recorded, until its form is opened again: whatever part is on screen says so. */
  proposed: Readonly<Record<string, boolean>>
}

/**
 * Sophia asked here: the reply request the API recorded and the message that asked (only that request's own state, or
 * her answer naming it, ends the wait), and this page's own time then (how long she has been waiting, by its clock).
 */
export interface Asked {
  replyId: string
  messageId: string
  here: number
}

/** The form's own place among the refusals. */
export const START = '#start'

export const NO_WORDS: ConversationAsk = { title: '', text: '', askSophia: true }

const EMPTY: Kept = {
  drafts: {},
  asks: {},
  holds: {},
  refusals: {},
  asked: {},
  start: { fields: NO_WORDS, held: null },
  proposals: {},
  proposalRefusals: {},
  proposed: {},
}

const kept = new Map<string, Kept>()
const listeners = new Set<() => void>()
/** Moves each time everything kept is forgotten: a write that began before never writes after. */
let generation = 0

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

/** The forgetting this reader was born after: a change it makes counts only while no forgetting came since. */
export const currentGeneration = (): number => generation

/** A change made by a reader born at `born`: dropped if everything was forgotten since (a write that outlived it). */
export function changeIfCurrent(place: string, born: number, change: (was: Kept) => Kept): void {
  if (born === generation) changeKept(place, change)
}

/** What is kept for one project and account, read outside React (a check, a test). */
export const keptAt = (place: string): Kept | undefined => kept.get(place)

/** Everything kept goes (signing out, another identity). */
export function forgetKept(): void {
  generation += 1
  kept.clear()
  for (const listener of listeners) listener()
}

/** What is kept for this project and account, and how to change it. */
export function useKept(projectId: string, name: string) {
  const place = `${projectId} ${name}`
  const value = useSyncExternalStore(subscribe, () => kept.get(place) ?? EMPTY)
  const born = useSyncExternalStore(subscribe, currentGeneration)
  // A write still on its way when the account was forgotten answers into nothing: never back into the store.
  const change = useCallback((f: (was: Kept) => Kept) => changeIfCurrent(place, born, f), [place, born])
  return { kept: value, change }
}

/** A record with one entry changed. */
export const withEntry = <T>(was: Readonly<Record<string, T>>, key: string, value: T): Readonly<Record<string, T>> => ({
  ...was,
  [key]: value,
})

/** A record without one entry. */
const withoutEntry = <T>(was: Readonly<Record<string, T>>, key: string): Readonly<Record<string, T>> =>
  Object.fromEntries(Object.entries(was).filter(([k]) => k !== key))

/** What is kept without one conversation's part (it was erased): its draft, intent, message held, refusal and wait. */
export const withoutConversation = (k: Kept, id: string): Kept => ({
  ...k,
  drafts: withoutEntry(k.drafts, id),
  asks: withoutEntry(k.asks, id),
  holds: withoutEntry(k.holds, id),
  refusals: withoutEntry(k.refusals, id),
  asked: withoutEntry(k.asked, id),
})
