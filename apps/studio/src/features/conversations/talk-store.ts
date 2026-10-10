// What a person has under way in a project's conversations (docs/plans/project-conversation-follow-ups.md), kept per
// project and account while the Studio is open, whatever is on screen: the view goes on a trip to Work or the room,
// and coming back finds it all. Each draft; each message on its way, or sent with no reply (its key and its words);
// a refusal that answered one meanwhile; since when Sophia was asked; and the start's words and intent. Forgotten on
// signing out or switching identity (App), as the cached reads are.
import { useMemo, useSyncExternalStore } from 'react'
import type { ConversationAsk, ConversationStarted, ConversationSummary, MessageAsk } from '../../api/conversations.ts'
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
  start: {
    fields: ConversationAsk
    held: Held<ConversationAsk> | null
    /**
     * A start's receipt held back, with the form's words as they stood then: it came while an erasure of its
     * conversation pressed here was on its way, had no reply, or was in doubt (`doubted`; PR #199 r4238177970). Erased,
     * it goes (`retired`); its doubt cleared by a list read made since, it lands (list-data `standing`). Until then the
     * form starts nothing new.
     */
    heldBack: { receipt: ConversationStarted; fields: ConversationAsk } | null
  }
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
  /**
   * The conversations whose erasure here was let go without being known erased (refused, whatever the refusal: it
   * answers its own try only, never an earlier one that had no reply; PR #199 r4238256883, CX-0059, CX-0060), each
   * with this view's order then (withdrawn-purge `orderNow`): whether they stand is in doubt until a read set out since
   * finds them (a list read listing one, or its direct read answering: `withStanding`; PR #199 r4238311491), or they
   * are known erased. Kept whether or not a start's receipt for one has come yet: one that comes is held back
   * meanwhile.
   */
  doubted: Readonly<Record<string, number>>
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
  /**
   * The row of each start held back that landed here (list-data `landed`), by its title only (no opening, no writer):
   * shown where a list of the newest only leaves it out, so it stays reachable and open across reads of it (list-data
   * `shownList`; PR #199 r4238533084). Gone once it is erased (`retired`): a whole list without it, or its direct
   * read's not found, settles it.
   */
  reached: Readonly<Record<string, ConversationSummary>>
  /**
   * A conversation's read answered not found (the open one's own, or a direct read: useProbes), at this view's order
   * then (withdrawn-purge `orderNow`), the latest such: it is erased, or this reader is no longer in the project,
   * which the API answers alike (PR #199 r4238709217, r4238826981). Until a list read set out since answers, which
   * only a reader still in the project gets, the view shows no conversation's row, thread or summary, cached or not;
   * a list read refused or failing keeps it so (`liftFence`). Which conversation answered so is `unfound`. Kept across
   * trips to another view.
   */
  fence: { at: number } | null
  /**
   * The conversations whose read answered not found (the open one's own, or a direct read: useProbes), each with this
   * view's order then (`at`). It is erased, or this reader is no longer in
   * the project: the API answers both alike (PR #199 r4238826981). Nothing is settled for one until a list read set
   * out since answers, which only a reader still in the project gets (`unfoundRead`). If that read lists it, it
   * stands. A whole list without it says it is erased. A list of the newest only without it proves nothing, so it is
   * read directly again (`checked`: that list read's order), and only a not found to a read set out after it settles
   * it. A direct read that answers says it stands. A list read refused or failing settles nothing.
   */
  unfound: Readonly<Record<string, { at: number; checked?: number }>>
}

/**
 * Sophia asked here: the reply request the API recorded and the message that asked (only that request's own state, or
 * her answer naming it, ends the wait), and this page's own time then (how long she has been waiting, by its clock).
 */
export interface Asked {
  replyId: string
  messageId: string
  here: number
  /**
   * Noted from a start's receipt held back (list-data `landed`), at this view's order then (withdrawn-purge
   * `orderNow`): its request may have ended meanwhile, so it is waited on only while a read of its thread set out after
   * that shows it still open; none such (none yet, one failing, one cached from before), no wait (PR #199 r4238533090,
   * r4238594445).
   */
  after?: number
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
  start: { fields: NO_WORDS, held: null, heldBack: null },
  proposals: {},
  proposalRefusals: {},
  proposed: {},
  decision: null,
  decisionRefusal: null,
  erasures: {},
  erased: {},
  doubted: {},
  withdrawals: {},
  homes: {},
  gone: {},
  listed: {},
  reached: {},
  fence: null,
  unfound: {},
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

/**
 * What is kept for one project and account (`place`) as a reader born at `born` changes and reads it: a write still on
 * its way when the account was forgotten answers into nothing, never back into the store, and reads nothing kept since.
 */
export function keptFor(place: string, born: number) {
  return {
    change: (f: (was: Kept) => Kept) => changeIfCurrent(place, born, f),
    /** What is kept now (not as a render read it): for an answer that comes late. */
    latest: (): Kept => (born === generation ? (kept.get(place) ?? EMPTY) : EMPTY),
  }
}

/** What is kept for this project and account, and how to change it. */
export function useKept(projectId: string, name: string) {
  const place = `${projectId} ${name}`
  const value = useSyncExternalStore(subscribe, () => kept.get(place) ?? EMPTY)
  const born = useSyncExternalStore(subscribe, currentGeneration)
  const { change, latest } = useMemo(() => keptFor(place, born), [place, born])
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
 * listed, a start's receipt held back for it) or a message gone (its proposal held, refused or recorded, its withdrawal
 * held). A late answer that wrote one back (a send with no reply, main's ProposeHere writing its own) is left out here,
 * at every change.
 */
export function retired(k: Kept): Kept {
  const { gone, erased } = k
  const messages = [k.proposals, k.proposalRefusals, k.proposed, k.withdrawals, k.homes]
  const conversations = [
    k.drafts,
    k.asks,
    k.holds,
    k.refusals,
    k.asked,
    k.erasures,
    k.doubted,
    k.listed,
    k.reached,
    k.unfound,
  ]
  const back = k.start.heldBack
  const backErased = back !== null && erased[back.receipt.conversation.id] === true
  if (!messages.some(holdsAny(gone)) && !conversations.some(holdsAny(erased)) && !backErased) return k
  return {
    ...k,
    start: backErased ? { ...k.start, heldBack: null } : k.start,
    drafts: without(k.drafts, erased),
    asks: without(k.asks, erased),
    holds: without(k.holds, erased),
    refusals: without(k.refusals, erased),
    asked: without(k.asked, erased),
    erasures: without(k.erasures, erased),
    doubted: without(k.doubted, erased),
    listed: without(k.listed, erased),
    reached: without(k.reached, erased),
    unfound: without(k.unfound, erased),
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

/** Whether something is kept for this message: a proposal held, refused or recorded, a withdrawal held, its home. */
const keepsMessage = (k: Kept, messageId: string) =>
  [k.proposals, k.proposalRefusals, k.proposed, k.withdrawals, k.homes].some((r) => messageId in r)

/**
 * Messages a thread read of this account's holds withdrawn, whoever withdrew them (another tab, an admin): gone, as
 * withoutMessage leaves one withdrawn here, in each of this account's projects that keeps something for one, and
 * nothing of theirs is kept again there, a late answer's write included (`retired`; PR #199 r4237767988). Another
 * account's part, another message's, and each conversation's own (its draft, its message held) stay. A proposal already
 * recorded stays recorded: only what this view keeps of it goes.
 */
export function retireWithdrawn(account: string, messages: readonly string[]): void {
  for (const [place, k] of kept) {
    // `${projectId} ${name}`: a project id holds no space, so the account is all after the first.
    if (place.slice(place.indexOf(' ') + 1) !== account) continue
    const out = messages.filter((m) => k.gone[m] !== true && keepsMessage(k, m))
    if (out.length > 0) changeKept(place, (was) => withGone(was, out))
  }
}

/**
 * What is kept without one erased conversation's part: its draft, intent, message held, refusal and wait, its
 * messages' proposals and withdrawals (never brought back: `retired`), and its erasure, settled (never brought back:
 * withErasure). Another conversation's part, and Still open's decision, stay.
 */
export function withoutConversation(k: Kept, id: string, read: readonly string[] = []): Kept {
  // Its messages: those with a home here, and those its thread was read with (PR #199 r4237298613: a proposal pressed
  // just before the erasure settled may not have its home yet). Gone, so a late answer for one keeps nothing either.
  const messages = [...new Set([...Object.keys(k.homes).filter((m) => k.homes[m] === id), ...read])]
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

/** The conversation a start's receipt is held back for (talk-store `heldBack`), if any. */
const heldBackFor = (k: Kept): string[] => (k.start.heldBack ? [k.start.heldBack.receipt.conversation.id] : [])

/**
 * The conversations a whole list read now no longer holds, of those seen listed here, with an erasure held here or in
 * doubt, with a start's receipt held back for them or landed after it (`reached`): gone (erased, here or by anyone
 * else). Only a whole list says so: call it with nothing else.
 */
export function goneFrom(k: Kept, now: readonly string[]): string[] {
  const here = new Set(now)
  const knew = new Set([
    ...Object.keys(k.listed),
    ...Object.keys(k.erasures),
    ...Object.keys(k.doubted),
    ...Object.keys(k.reached),
    ...heldBackFor(k),
  ])
  return [...knew].filter((id) => !here.has(id))
}

/** Fenced (`fence`) by a read answering not found at `at`: until a list read set out after the latest such. */
export const withFence = (k: Kept, at: number): Kept => (k.fence && k.fence.at >= at ? k : { ...k, fence: { at } })

/** Whether a list read set out at `readFrom` (this view's order) is since the fence, and so lifts it (`liftFence`). */
export const fenceLifts = (k: Kept, readFrom: number): boolean => k.fence !== null && readFrom > k.fence.at

/**
 * What is kept once a list read set out at `readFrom` answered: the reader is still in the project, so a fence from
 * before it goes. A read from before the fence, or from the same moment, changes nothing.
 */
export const liftFence = (k: Kept, readFrom: number): Kept => (fenceLifts(k, readFrom) ? { ...k, fence: null } : k)

/** Answered not found at `at` (`unfound`): kept, nothing settled, until a list read set out since says. */
export const withUnfound = (k: Kept, id: string, at: number): Kept =>
  k.erased[id] ? k : { ...k, unfound: withEntry(k.unfound, id, { at }) }

/** A direct read answered: it stands, whatever not found an earlier read had. */
export const withFound = (k: Kept, id: string): Kept =>
  id in k.unfound ? { ...k, unfound: withoutEntry(k.unfound, id) } : k

/** Whether a not found to a direct read set out at `from` settles it: after a list read since its last one answered. */
export function unfoundSettles(k: Kept, id: string, from: number): boolean {
  const checked = k.unfound[id]?.checked
  return checked !== undefined && from > checked
}

/**
 * What a list read set out at `readFrom` says of each conversation unfound before it (`unfound`), listing `listed`,
 * whole or of the newest only: listed, it stands (kept no more as unfound); a whole list without it, it is erased
 * (`settle`: the view settles it); one of the newest only without it, it is read directly again (`recheck`), noted
 * as checked at that read. One checked already waits on its own read. Kept as it was when nothing changes.
 */
export function unfoundRead(
  k: Kept,
  readFrom: number,
  listed: readonly string[],
  whole: boolean,
): { kept: Kept; settle: string[]; recheck: string[] } {
  const due = Object.entries(k.unfound).filter(([, u]) => u.at < readFrom)
  const stands = due.filter(([id]) => listed.includes(id)).map(([id]) => id)
  const missing = due.filter(([id]) => !listed.includes(id))
  const settle = whole ? missing.map(([id]) => id) : []
  const recheck = whole ? [] : missing.filter(([, u]) => u.checked === undefined).map(([id]) => id)
  if (stands.length === 0 && recheck.length === 0) return { kept: k, settle, recheck }
  const unfound = Object.fromEntries(
    Object.entries(k.unfound)
      .filter(([id]) => !stands.includes(id))
      .map(([id, u]) => [id, recheck.includes(id) ? { at: u.at, checked: readFrom } : u]),
  )
  return { kept: { ...k, unfound }, settle, recheck }
}

/** The conversations in doubt (`doubted`) with no erasure of them held here now: a list read made since says. */
export const awaiting = (k: Kept): string[] => Object.keys(k.doubted).filter((id) => (k.erasures[id] ?? null) === null)

/**
 * What is kept once a read set out at `readFrom` (this view's order) found these conversations (a list read listing
 * them, or a direct read answering): those in doubt since before it, with no erasure of them held now, stand.
 */
export function withStanding(k: Kept, ids: readonly string[], readFrom: number): Kept {
  const stood = new Set(awaiting(k).filter((id) => ids.includes(id) && (k.doubted[id] ?? readFrom) < readFrom))
  if (stood.size === 0) return k
  return { ...k, doubted: Object.fromEntries(Object.entries(k.doubted).filter(([id]) => !stood.has(id))) }
}

/** An entry that holds something (not left empty, not cleared). */
const held = (v: unknown) => v !== null && v !== undefined

/**
 * Whether anything is kept here for this conversation, by what is kept, not by an entry left empty (PR #199
 * r4235731017): a draft with words; a message held, its refusal or its wait; its erasure held (its key) or in doubt; a
 * start's receipt held back for it, or landed after it (`reached`); or a message of it with a proposal held, refused or
 * recorded, or a withdrawal held.
 */
export function keepsFor(k: Kept, id: string): boolean {
  if ((k.drafts[id] ?? '').trim() !== '' || id in k.doubted || id in k.reached || id in k.unfound) return true
  if (heldBackFor(k).includes(id)) return true
  if ([k.holds[id], k.refusals[id], k.asked[id], k.erasures[id]].some(held)) return true
  const messages = Object.keys(k.homes).filter((m) => k.homes[m] === id)
  return messages.some((m) => [k.proposals[m], k.proposalRefusals[m], k.proposed[m], k.withdrawals[m]].some(held))
}

/**
 * What is kept with the conversations a list read now holds seen: a whole list's are the ones seen from now on (what it
 * left out was settled before: goneFrom); a list of the newest only adds its own, and forgets none it left out.
 */
export function withListed(k: Kept, listedNow: readonly string[], whole: boolean): Kept {
  // One erased here is never noted seen again (`retired` would take it back out, at every change: CX-0071).
  const now = listedNow.filter((id) => !k.erased[id])
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
 * when a late answer to it changes nothing. Answered (let go), it is in doubt (`doubted`, at `at`: this view's order
 * now) until known erased (its reply settles it next) or found by a read set out since (PR #199 r4238256883, CX-0059,
 * CX-0060, r4238311491).
 */
export function withErasure(k: Kept, id: string, next: Held<string> | null, at: number): Kept {
  if (k.erased[id]) return k
  if (next) return { ...k, erasures: withEntry(k.erasures, id, next) }
  return { ...k, erasures: withoutEntry(k.erasures, id), doubted: withEntry(k.doubted, id, at) }
}
