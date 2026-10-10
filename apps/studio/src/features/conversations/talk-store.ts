// What a person has under way in a project's conversations (docs/plans/project-conversation-follow-ups.md), kept per
// project and account while the Studio is open, whatever is on screen: the view goes on a trip to Work or the room,
// and coming back finds it all. Each draft; each message on its way, or sent with no reply (its key and its words);
// a refusal that answered one meanwhile; since when Sophia was asked; and the start's words and intent. Forgotten on
// signing out or switching identity (App), as the cached reads are.
import { useCallback, useSyncExternalStore } from 'react'
import type { ConversationAsk, MessageAsk } from '../../api/conversations.ts'
import type { DecisionAsk, ProposedMark } from './decide.ts'
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
  /**
   * The proposal a message made, once recorded, until its form is opened again: whatever part is on screen says where
   * it stands in the brief (proposed-truth.md).
   */
  proposed: Readonly<Record<string, ProposedMark | null>>
  /** Still open's decision on its way, or sent with no reply (its key and intent): one at a time, never sent twice. */
  decision: Held<DecisionAsk> | null
  /** The words of a refusal that answered Still open's decision, until its next press. */
  decisionRefusal: string | null
  /**
   * A conversation's erasure on its way, or sent with no reply (its key), by conversation: kept here, not by the part
   * that pressed it, so opening another conversation and coming back sends it again under the same key, never anew.
   */
  erasures: Readonly<Record<string, Held<string> | null>>
  /**
   * The conversations known erased here (its erasure's reply, or the whole list read without it): nothing is kept for
   * them again, so a late answer to their erasure (a failure, or no reply) never brings its intent back.
   */
  erased: Readonly<Record<string, true>>
  /** A message's withdrawal on its way, or sent with no reply (its key), by message: sent again under the same key. */
  withdrawals: Readonly<Record<string, Held<string> | null>>
  /** The conversation of each message that has something kept here (a withdrawal or a proposal), by message. */
  homes: Readonly<Record<string, string>>
  /**
   * Messages withdrawn here, or whose conversation is gone: nothing is kept for them again, whatever answers late (a
   * proposal's reply included): every change to what is kept leaves their part out (`retired`).
   */
  gone: Readonly<Record<string, true>>
  /**
   * The conversations this view has seen listed (any list read, the newest only included, a start just made too): one a
   * whole list read later no longer holds is gone. A list of the newest only leaving one out proves nothing.
   */
  listed: Readonly<Record<string, true>>
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
  decision: null,
  decisionRefusal: null,
  erasures: {},
  erased: {},
  withdrawals: {},
  homes: {},
  gone: {},
  listed: {},
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

/**
 * Changes what is kept for one project and account (never anything for a conversation erased or a message gone, a late
 * answer's write included: `retired`); everyone reading it reads it again.
 */
export function changeKept(place: string, change: (was: Kept) => Kept): void {
  kept.set(place, retired(change(kept.get(place) ?? EMPTY)))
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
  /** What is kept now (not as this render read it): for an answer that comes late. */
  const latest = useCallback(() => kept.get(place) ?? EMPTY, [place])
  return { kept: value, change, latest }
}

/** A record with one entry changed. */
export const withEntry = <T>(was: Readonly<Record<string, T>>, key: string, value: T): Readonly<Record<string, T>> => ({
  ...was,
  [key]: value,
})

/** A record without one entry. */
const withoutEntry = <T>(was: Readonly<Record<string, T>>, key: string): Readonly<Record<string, T>> =>
  Object.fromEntries(Object.entries(was).filter(([k]) => k !== key))

/** A record without the entries `out` names. */
const without = <T>(
  was: Readonly<Record<string, T>>,
  out: Readonly<Record<string, true>>,
): Readonly<Record<string, T>> => Object.fromEntries(Object.entries(was).filter(([k]) => out[k] !== true))

/** Whether a record holds an entry `out` names. */
const holdsAny = (out: Readonly<Record<string, true>>) => (r: Readonly<Record<string, unknown>>) =>
  Object.keys(r).some((id) => out[id])

/**
 * What is kept with no part for a conversation erased (its draft, intent, message held, refusal, wait, erasure, seen
 * listed) or a message gone (its proposal held, refused or recorded, its withdrawal held). A late answer that wrote one
 * back (a send with no reply, main's ProposeHere writing its own) is left out here, at every change.
 */
export function retired(k: Kept): Kept {
  const { gone, erased } = k
  const messages = [k.proposals, k.proposalRefusals, k.proposed, k.withdrawals, k.homes]
  const conversations = [k.drafts, k.asks, k.holds, k.refusals, k.asked, k.erasures, k.listed]
  if (!messages.some(holdsAny(gone)) && !conversations.some(holdsAny(erased))) return k
  return {
    ...k,
    drafts: without(k.drafts, erased),
    asks: without(k.asks, erased),
    holds: without(k.holds, erased),
    refusals: without(k.refusals, erased),
    asked: without(k.asked, erased),
    erasures: without(k.erasures, erased),
    listed: without(k.listed, erased),
    proposals: without(k.proposals, gone),
    proposalRefusals: without(k.proposalRefusals, gone),
    proposed: without(k.proposed, gone),
    withdrawals: without(k.withdrawals, gone),
    homes: without(k.homes, gone),
  }
}

/** What is kept with these messages gone (withdrawn, or their conversation erased): nothing of theirs, ever again. */
const withGone = (k: Kept, messages: readonly string[]): Kept =>
  retired({ ...k, gone: { ...k.gone, ...Object.fromEntries(messages.map((m) => [m, true as const])) } })

/** What is kept once a message is withdrawn here: its proposal and its withdrawal held go, and never come back. */
export const withoutMessage = (k: Kept, messageId: string): Kept => withGone(k, [messageId])

/**
 * What is kept without one erased conversation's part: its draft, intent, message held, refusal and wait, its
 * messages' proposals and withdrawals (never brought back: `retired`), and its erasure, settled (never brought back:
 * withErasure). Another conversation's part, and Still open's decision, stay.
 */
export function withoutConversation(k: Kept, id: string): Kept {
  const messages = Object.keys(k.homes).filter((m) => k.homes[m] === id)
  return withGone(
    {
      ...k,
      drafts: withoutEntry(k.drafts, id),
      asks: withoutEntry(k.asks, id),
      holds: withoutEntry(k.holds, id),
      refusals: withoutEntry(k.refusals, id),
      asked: withoutEntry(k.asked, id),
      erasures: withoutEntry(k.erasures, id),
      erased: withEntry(k.erased, id, true),
      listed: withoutEntry(k.listed, id),
    },
    messages,
  )
}

/** The message's conversation known, for a message with something kept here (its erasure takes that too). */
export const withHome = (k: Kept, messageId: string, conversationId: string): Kept =>
  k.homes[messageId] === conversationId ? k : { ...k, homes: withEntry(k.homes, messageId, conversationId) }

/**
 * The conversations a whole list read now no longer holds, of those seen listed here or with an erasure held here:
 * gone (erased, here or by anyone else). Only a whole list says so: call it with nothing else.
 */
export function goneFrom(k: Kept, now: readonly string[]): string[] {
  const here = new Set(now)
  const knew = new Set([...Object.keys(k.listed), ...Object.keys(k.erasures)])
  return [...knew].filter((id) => !here.has(id))
}

/**
 * What is kept with the conversations a list read now holds seen: a whole list's are the ones seen from now on (what it
 * left out was settled before: goneFrom); a list of the newest only adds its own, and forgets none it left out.
 */
export function withListed(k: Kept, now: readonly string[], whole: boolean): Kept {
  const added = now.filter((id) => !k.listed[id])
  const dropped = whole ? Object.keys(k.listed).filter((id) => !now.includes(id)) : []
  if (added.length === 0 && dropped.length === 0) return k
  const base = whole ? {} : k.listed
  return { ...k, listed: { ...base, ...Object.fromEntries(now.map((id) => [id, true as const])) } }
}

/** A message's withdrawal intent, changed, and its conversation known (so its erasure takes it too). */
export function withWithdrawal(k: Kept, messageId: string, conversationId: string, next: Held<string> | null): Kept {
  if (k.gone[messageId]) return k
  const withdrawals = next ? withEntry(k.withdrawals, messageId, next) : withoutEntry(k.withdrawals, messageId)
  return withHome({ ...k, withdrawals }, messageId, conversationId)
}

/**
 * One conversation's erasure intent, changed (on its way, with no reply, or answered): unless it was settled already,
 * when a late answer to it changes nothing.
 */
export function withErasure(k: Kept, id: string, next: Held<string> | null): Kept {
  if (k.erased[id]) return k
  return { ...k, erasures: next ? withEntry(k.erasures, id, next) : withoutEntry(k.erasures, id) }
}
