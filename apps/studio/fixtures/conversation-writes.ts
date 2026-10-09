// A16's writes as the fixture pages answer them (docs/plans/project-conversation-writes.md; CON-01): a conversation
// started, a message sent, each once per Idempotency-Key (the same key replays its receipt); viewers refused. Its
// author withdraws their own message, an admin removes any or erases a conversation, as 0048 does it
// (`withdraw=slow`: its reply and the feed 1.5 s on; `withdraw=feedFirst`: the feed 0.5 s on, its reply 2.5 s on;
// `withdraw=thenFail`: it lands, then the conversation's and the list's reads fail; `withdraw=unreached`: the first
// one never reaches the API). Asking
// Sophia records a reply request on the message; her answer, a later message 900 ms on, names that request and settles
// it, with the project's feed moving as it lands; what she says, sophia-answers.ts. Every word is synthetic.
import type { ConversationReply } from '@sophia/contracts'
import type { FixtureConversation, FixtureMessage } from './conversation-data.ts'
import { wireMessage, wireSummary } from './conversation-wire.ts'
import { membership } from './data.ts'
import { PROJECT } from './data.ts'
import { VIEWER_NAME } from './demo.ts'
import { answerFor } from './sophia-answers.ts'

/** What the writes keep: the conversations themselves, and the receipts by key. */
export interface TalkWrites {
  list: FixtureConversation[]
  messages: Record<string, FixtureMessage[]>
  /**
   * `send=lost`: the first message lands, its reply lost; `send=refused`: messages are refused; `send=refusedSlow`:
   * refused 1.5 s on; `send=slow`: each reply takes 1.5 s; `send=thenFail`: it lands, then the conversation's reads fail.
   */
  send: 'lost' | 'refused' | 'refusedSlow' | 'slow' | 'thenFail' | null
  /** `start=lost`: the first conversation started lands, its reply lost; `start=slow`: its reply takes 1.5 s. */
  start: 'lost' | 'slow' | null
  /** How long Sophia takes to answer (`answer=slow`: 10 s; else 0.9 s). */
  answerMs: number
  /**
   * A withdrawal's reply and the feed: both 1.5 s on (`withdraw=slow`), the feed first (`feedFirst`), at once, or at
   * once and then every read of the conversation and the list failing (`thenFail`).
   */
  withdraw: 'slow' | 'feedFirst' | 'thenFail' | 'unreached' | null
  /** A withdrawal has already failed to reach the API (`withdraw=unreached` lets one through after it). */
  withdrawMissed?: boolean
  /** The list's reads fail. */
  failList: boolean
  /**
   * An erasure's feed 0.5 s on and its reply 2.5 s on (`erase=feedFirst`); the first one never reaching the API
   * (`erase=unreached`); one that lands with the feed moving but its reply lost (`erase=lost`); or both at once.
   */
  erase: 'feedFirst' | 'unreached' | 'lost' | null
  /** An erasure has already failed to reach the API (`erase=unreached` lets one through after it). */
  eraseMissed?: boolean
  /** The conversations erased here: a read of one is refused as not found (0048 hides it), never answered with words. */
  erasedIds?: Set<string>
  /** This conversation's messages fail to read (`messages=fail`, or after a `send=thenFail` write). */
  failMessagesOf: string | null
  /** Each write's receipt by its key, with the words it was sent with: the same key replays it, only with them. */
  receipts: Map<string, { body: string; receipt: unknown }>
}

interface Context {
  viewer: boolean
  /** An admin removes any message and erases a conversation. */
  admin: boolean
  /** What the page records as served (`window.fixture.served`). */
  record: (what: string) => void
  /** The project's feed moves (Sophia's answer landed). */
  moved: () => void
}

const MESSAGES_TO = /^\/api\/v1\/conversations\/([0-9a-f-]{36})\/messages$/
const WITHDRAWAL_OF = /^\/api\/v1\/conversations\/([0-9a-f-]{36})\/messages\/([0-9a-f-]{36})\/withdrawal$/
const ERASURE_OF = /^\/api\/v1\/conversations\/([0-9a-f-]{36})\/erasure$/
const ME = membership.actorId
let made = 0
let sent = 0
/** Ids the writes make, UUIDs as A16's are. */
let ids = 0
const freshId = () => {
  ids += 1
  return `00000000-0000-4000-8000-0000000e${ids.toString(16).padStart(4, '0')}`
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const refused = (message = 'Viewers read conversations') =>
  json({ code: 'forbidden', message, requestId: '00000000-0000-4000-8000-0000000000bf', retry: 'never' }, 403)

/** One minute after the newest activity (or the fixtures' day, with none): the conversation written in is the newest. */
const next = (list: readonly FixtureConversation[]) =>
  new Date(
    Math.max(Date.parse('2026-10-06T00:00:00.000Z'), ...list.map((c) => Date.parse(c.lastAt))) + 60_000,
  ).toISOString()

/** An answer `ms` later. */
const later = (ms: number, answer: () => Response) =>
  new Promise<Response>((resolve) => setTimeout(() => resolve(answer()), ms))

const bodyOf = (init: RequestInit | undefined): Record<string, unknown> | null => {
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  return typeof body === 'object' && body !== null ? Object.fromEntries(Object.entries(body)) : null
}

/** Which write a path is: a conversation started, a message to one, or neither. */
function routeOf(path: string): { start: true } | { to: string } | null {
  if (path === `/api/v1/projects/${PROJECT}/conversations`) return { start: true }
  const to = MESSAGES_TO.exec(path)?.[1]
  return to ? { to } : null
}

/** A18's writes; undefined for any other request. */
export function conversationWritten(talk: TalkWrites, path: string, init: RequestInit | undefined, ctx: Context) {
  const route = routeOf(path)
  if (!route) return undefined
  if (ctx.viewer) return refused()
  const key = new Headers(init?.headers).get('idempotency-key')
  // A write without its key, or a key again with other words, is the client's mistake: unexpected.
  if (!key) return null
  const replayed = talk.receipts.get(key)
  if (replayed) return replayed.body === init?.body ? json(replayed.receipt) : null
  const body = bodyOf(init)
  if (typeof body?.text !== 'string' || typeof body.askSophia !== 'boolean') return null
  return 'to' in route ? messageSent(talk, route.to, key, body, ctx) : started(talk, key, body, ctx)
}

function started(talk: TalkWrites, key: string, body: Record<string, unknown>, ctx: Context) {
  if (typeof body.title !== 'string' || body.title.length > 120) return null
  made += 1
  const id = freshId()
  const at = next(talk.list)
  const mid = freshId()
  const message: FixtureMessage = {
    id: mid,
    author: 'member',
    actorId: ME,
    name: VIEWER_NAME,
    text: String(body.text),
    at,
    ask: body.askSophia ? askOf(mid, at) : null,
  }
  const conversation: FixtureConversation = {
    id,
    title: body.title,
    summary: null,
    lastAt: at,
    contributors: [{ actorId: ME, name: VIEWER_NAME }],
    sophia: false,
    openQuestions: 0,
    output: null,
  }
  talk.list.unshift(conversation)
  talk.messages[id] = [message]
  const receipt = {
    conversation: wireSummary(conversation, [message], false),
    message: wireMessage(message, 0),
    sophia: message.ask ? 'asked' : 'not_asked',
    reply: message.ask ?? null,
  }
  talk.receipts.set(key, { body: JSON.stringify(body), receipt })
  ctx.record(`conversation-start:${body.title}:${body.askSophia ? 'yes' : 'no'}`)
  if (message.ask) answerLater(talk, id, message, ctx)
  // It landed; the page never hears so, and only starting again under the same key can tell it.
  if (talk.start === 'lost' && made === 1) return Promise.reject(new TypeError('Failed to fetch'))
  if (talk.start === 'slow') return later(1500, () => json(receipt, 201))
  return json(receipt, 201)
}

function messageSent(talk: TalkWrites, id: string, key: string, body: Record<string, unknown>, ctx: Context) {
  const conversation = talk.list.find((c) => c.id === id)
  const all = talk.messages[id]
  if (!conversation || !all) return null
  if (talk.send === 'refused') return refused()
  if (talk.send === 'refusedSlow') return later(1500, refused)
  sent += 1
  const at = next(talk.list)
  const mid = freshId()
  const message: FixtureMessage = {
    id: mid,
    author: 'member',
    actorId: ME,
    name: VIEWER_NAME,
    text: String(body.text),
    at,
    ask: body.askSophia ? askOf(mid, at) : null,
  }
  all.push(message)
  conversation.lastAt = at
  if (!conversation.contributors.some((p) => p.actorId === ME)) {
    conversation.contributors = [...conversation.contributors, { actorId: ME, name: VIEWER_NAME }]
  }
  const receipt = {
    message: wireMessage(message, all.length - 1),
    sophia: message.ask ? 'asked' : 'not_asked',
    reply: message.ask ?? null,
  }
  talk.receipts.set(key, { body: JSON.stringify(body), receipt })
  ctx.record(`conversation-message:${String(body.text)}:${body.askSophia ? 'yes' : 'no'}`)
  if (message.ask) answerLater(talk, id, message, ctx)
  return replied(talk, id, receipt, ctx)
}

/** How a message that landed is answered, as the page asked (`send=`): lost, slow, then its reads failing, or at once. */
function replied(talk: TalkWrites, id: string, receipt: unknown, ctx: Context) {
  // It landed; the page never hears so, and only sending again under the same key can tell it.
  if (talk.send === 'lost' && sent === 1) return Promise.reject(new TypeError('Failed to fetch'))
  if (talk.send === 'slow') {
    return later(1500, () => {
      ctx.record('reply:message') // the receipt reaches the page now
      return json(receipt, 201)
    })
  }
  if (talk.send === 'thenFail') talk.failMessagesOf = id
  return json(receipt, 201)
}

/** A reply request, recorded with the message that asks, pending until her answer names it. */
const askOf = (messageId: string, at: string): ConversationReply => ({
  id: freshId(),
  messageId,
  state: 'pending',
  reason: null,
  answerId: null,
  askedAt: at,
  settledAt: null,
})

/**
 * Sophia's answer to what was asked, a later message naming the request it answers: the request is answered, the
 * conversation counts her in, and the feed moves.
 */
function answerLater(talk: TalkWrites, id: string, asking: FixtureMessage, ctx: Context) {
  const request = asking.ask
  if (!request) return
  setTimeout(() => {
    const conversation = talk.list.find((c) => c.id === id)
    const all = talk.messages[id]
    if (!conversation || !all) return
    const at = next(talk.list)
    const text = answerFor(asking.text ?? '', all)
    const answer: FixtureMessage = {
      id: freshId(),
      author: 'sophia',
      actorId: null,
      name: null,
      text,
      at,
      replyTo: { messageId: asking.id, replyId: request.id },
    }
    all.push(answer)
    asking.ask = { ...request, state: 'answered', answerId: answer.id, settledAt: at }
    conversation.lastAt = at
    conversation.sophia = true
    ctx.moved()
  }, talk.answerMs)
}

/** A withdrawal (A16), once per key: the same key replays its receipt; undefined for any other request. */
export function conversationWithdrawn(talk: TalkWrites, path: string, init: RequestInit | undefined, ctx: Context) {
  const [, conversationId = '', messageId = ''] = WITHDRAWAL_OF.exec(path) ?? []
  if (!messageId) return undefined
  const key = new Headers(init?.headers).get('idempotency-key')
  if (!key) return null
  const what = `withdraw:${messageId}`
  // Each try, by its key: the same intent goes again under the same key, whatever the page did meanwhile.
  ctx.record(`withdraw-key:${key}`)
  if (missedOnce(talk)) return Promise.reject(new TypeError('Failed to fetch'))
  const replayed = talk.receipts.get(key)
  if (replayed) return replayed.body === what ? json(replayed.receipt, 202) : null
  const answer = withdrawn(talk, conversationId, messageId, ctx)
  if (answer === null || answer instanceof Response) return answer
  talk.receipts.set(key, { body: what, receipt: answer })
  failAfter(talk, conversationId)
  return withdrawalReplied(talk.withdraw, answer, ctx)
}

/** `withdraw=thenFail`: once it lands, the conversation's reads and the list's fail. */
function failAfter(talk: TalkWrites, conversationId: string) {
  if (talk.withdraw !== 'thenFail') return
  talk.failMessagesOf = conversationId
  talk.failList = true
}

/** `withdraw=unreached`: the first withdrawal never reaches the API (whether this one is it); later ones do. */
function missedOnce(talk: TalkWrites): boolean {
  if (talk.withdraw !== 'unreached' || talk.withdrawMissed) return false
  talk.withdrawMissed = true
  return true
}

/** The API's event and its reply both follow its commit, in either order: the feed moves with the reply, or first. */
function withdrawalReplied(order: TalkWrites['withdraw'], answer: unknown, ctx: Context) {
  const reply = () => {
    ctx.record('reply:withdrawal')
    return json(answer, 202)
  }
  if (order === 'feedFirst') {
    setTimeout(ctx.moved, 500)
    return later(2500, reply)
  }
  const both = () => {
    ctx.moved()
    return reply()
  }
  return order === 'slow' ? later(1500, both) : both()
}

/**
 * A message its author withdraws: its words and name go, and so do Sophia's answers that read it (asked at it or
 * after), and a request still open there is cancelled; whoever has nothing left there stops counting.
 */
function withdrawn(talk: TalkWrites, conversationId: string, messageId: string, ctx: Context) {
  const conversation = talk.list.find((c) => c.id === conversationId)
  const all = talk.messages[conversationId]
  const at = all?.findIndex((m) => m.id === messageId) ?? -1
  const message = all?.[at]
  if (!conversation || !all || !message) return null
  const own = message.author === 'member' && message.actorId === ME
  if (!own && !ctx.admin) return refused('Only its author or an admin withdraws a message')
  withdrawFrom(all, at, next(talk.list))
  conversation.contributors = conversation.contributors.filter((p) =>
    all.some((m) => m.author === 'member' && m.actorId === p.actorId && !m.withdrawn),
  )
  conversation.sophia = all.some((m) => m.author === 'sophia' && !m.withdrawn)
  ctx.record(`conversation-withdraw:${message.id.slice(-2)}`)
  return { conversationId, message: wireMessage(message, at) }
}

/** The message at `at` withdrawn, with Sophia's answers to it or after it; a request still open from there cancelled. */
function withdrawFrom(all: FixtureMessage[], at: number, now: string) {
  const gone = (m: FixtureMessage) => {
    if (m.withdrawn) return
    m.withdrawn = { at: now }
    m.text = null
    m.name = null
  }
  const target = all[at]
  if (target) gone(target)
  for (const [i, m] of all.entries()) {
    if (m.author === 'sophia' && all.findIndex((x) => x.id === m.replyTo?.messageId) >= at) gone(m)
    if (m.ask && i >= at && ['pending', 'running', 'outcome_unknown'].includes(m.ask.state)) {
      m.ask = { ...m.ask, state: 'cancelled', reason: 'source_withdrawn', settledAt: now }
    }
  }
}

/** A conversation an admin erases (A16), once per key: it leaves the list, with every message; undefined otherwise. */
export function conversationErased(talk: TalkWrites, path: string, init: RequestInit | undefined, ctx: Context) {
  const conversationId = ERASURE_OF.exec(path)?.[1]
  if (!conversationId) return undefined
  const key = new Headers(init?.headers).get('idempotency-key')
  if (!key) return null
  const what = `erase:${conversationId}`
  // Each try, by its key: the same intent goes again under the same key, whatever the page did meanwhile.
  ctx.record(`erase-key:${key}`)
  if (talk.erase === 'unreached' && !talk.eraseMissed) {
    talk.eraseMissed = true
    return Promise.reject(new TypeError('Failed to fetch'))
  }
  const replayed = talk.receipts.get(key)
  if (replayed) return replayed.body === what ? json(replayed.receipt, 202) : null
  if (!ctx.admin) return refused('Only an admin erases a conversation')
  const at = talk.list.findIndex((c) => c.id === conversationId)
  if (at < 0) return null
  talk.list.splice(at, 1)
  // Its messages are gone for good. A read of them is refused as the API refuses it (not found), never answered; one
  // for any conversation this fixture never knew stays unexpected.
  delete talk.messages[conversationId]
  ;(talk.erasedIds ??= new Set()).add(conversationId)
  const receipt = { conversationId, erased: true }
  talk.receipts.set(key, { body: what, receipt })
  ctx.record(`conversation-erase:${conversationId.slice(-2)}`)
  return erasureReplied(talk.erase, receipt, ctx)
}

/** How an erasure that landed is answered: the feed and its reply at once, the feed first, or its reply lost. */
function erasureReplied(order: TalkWrites['erase'], receipt: unknown, ctx: Context) {
  if (order === 'lost') {
    // It landed, and the feed says so; its reply never comes.
    ctx.moved()
    return Promise.reject(new TypeError('Failed to fetch'))
  }
  if (order !== 'feedFirst') {
    ctx.moved()
    return json(receipt, 202)
  }
  // The feed shows it gone first; its reply comes later.
  setTimeout(ctx.moved, 500)
  return later(2500, () => {
    ctx.record('reply:erasure')
    return json(receipt, 202)
  })
}
