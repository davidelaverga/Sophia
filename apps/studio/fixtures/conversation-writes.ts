// A18's writes as the proposed API would answer them (docs/plans/project-conversation-writes.md): a conversation
// started, a message sent, each once per Idempotency-Key (the same key replays its receipt); viewers refused; Sophia's
// answer a later message, 900 ms on, with the project's feed moving as it lands. Every word is synthetic.
import type { ConversationMessage, ConversationSummary } from '../src/api/vision.ts'
import { membership } from './data.ts'
import { PROJECT } from './data.ts'

/** What the writes keep: the conversations themselves, and the receipts by key. */
export interface TalkWrites {
  list: ConversationSummary[]
  messages: Record<string, ConversationMessage[]>
  /** `send=lost`: the first message lands, its reply lost; `send=refused`: messages are refused; `send=slow`: each
   * message's reply takes 1.5 s. */
  send: 'lost' | 'refused' | 'slow' | null
  /** `start=lost`: the first conversation started lands, its reply lost. */
  start: 'lost' | null
  /** Each write's receipt by its key, with the words it was sent with: the same key replays it, only with them. */
  receipts: Map<string, { body: string; receipt: unknown }>
}

interface Context {
  viewer: boolean
  /** What the page records as served (`window.fixture.served`). */
  record: (what: string) => void
  /** The project's feed moves (Sophia's answer landed). */
  moved: () => void
}

const MESSAGES_TO = /^\/api\/v1\/conversations\/([0-9a-f-]{36})\/messages$/
const ME = membership.actorId
const ANSWER = 'I’ll keep that with the question, and say what the project already decided about it.'
let made = 0
let sent = 0

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const refused = () =>
  json(
    {
      code: 'forbidden',
      message: 'Viewers read conversations',
      requestId: '00000000-0000-4000-8000-0000000000bf',
      retry: 'never',
    },
    403,
  )

/** One minute after the newest activity: the conversation written in becomes the newest. */
const next = (list: readonly ConversationSummary[]) =>
  new Date(Math.max(...list.map((c) => Date.parse(c.lastAt))) + 60_000).toISOString()

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
  const id = `00000000-0000-4000-8000-0000000000e${String(made)}`
  const at = next(talk.list)
  const message: ConversationMessage = {
    id: `${id}-1`,
    author: 'member',
    actorId: ME,
    name: 'Fixture viewer',
    text: String(body.text),
    at,
  }
  const conversation: ConversationSummary = {
    id,
    title: body.title,
    summary: null,
    lastAt: at,
    contributors: [{ actorId: ME, name: 'Fixture viewer' }],
    sophia: false,
    openQuestions: 0,
    output: null,
  }
  talk.list.unshift(conversation)
  talk.messages[id] = [message]
  const receipt = { conversation, message }
  talk.receipts.set(key, { body: JSON.stringify(body), receipt })
  ctx.record(`conversation-start:${body.title}:${body.askSophia ? 'yes' : 'no'}`)
  if (body.askSophia) answerLater(talk, id, ctx)
  // It landed; the page never hears so, and only starting again under the same key can tell it.
  if (talk.start === 'lost' && made === 1) return Promise.reject(new TypeError('Failed to fetch'))
  return json(receipt, 201)
}

function messageSent(talk: TalkWrites, id: string, key: string, body: Record<string, unknown>, ctx: Context) {
  const conversation = talk.list.find((c) => c.id === id)
  const all = talk.messages[id]
  if (!conversation || !all) return null
  if (talk.send === 'refused') return refused()
  sent += 1
  const at = next(talk.list)
  const message: ConversationMessage = {
    id: `${id}-m${String(sent)}`,
    author: 'member',
    actorId: ME,
    name: 'Fixture viewer',
    text: String(body.text),
    at,
  }
  all.push(message)
  conversation.lastAt = at
  if (!conversation.contributors.some((p) => p.actorId === ME)) {
    conversation.contributors = [...conversation.contributors, { actorId: ME, name: 'Fixture viewer' }]
  }
  const receipt = { message, sophia: body.askSophia ? 'asked' : 'not_asked' }
  talk.receipts.set(key, { body: JSON.stringify(body), receipt })
  ctx.record(`conversation-message:${String(body.text)}:${body.askSophia ? 'yes' : 'no'}`)
  if (body.askSophia) answerLater(talk, id, ctx)
  // It landed; the page never hears so, and only sending again under the same key can tell it.
  if (talk.send === 'lost' && sent === 1) return Promise.reject(new TypeError('Failed to fetch'))
  if (talk.send === 'slow') return new Promise<Response>((r) => setTimeout(() => r(json(receipt, 201)), 1500))
  return json(receipt, 201)
}

/** Sophia's answer, a later message: the conversation counts her in, and the feed moves. */
function answerLater(talk: TalkWrites, id: string, ctx: Context) {
  setTimeout(() => {
    const conversation = talk.list.find((c) => c.id === id)
    const all = talk.messages[id]
    if (!conversation || !all) return
    const at = next(talk.list)
    all.push({ id: `${id}-s${String(all.length)}`, author: 'sophia', actorId: null, name: null, text: ANSWER, at })
    conversation.lastAt = at
    conversation.sophia = true
    ctx.moved()
  }, 900)
}
