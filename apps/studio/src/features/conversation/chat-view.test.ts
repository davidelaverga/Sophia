import assert from 'node:assert/strict'
import { it } from 'node:test'
import type { SophiaPresence } from '@sophia/contracts'
import type { ChatCaption, ChatNotice } from '@sophia/contracts/room-chat'
import { receiveCaption } from './captions.ts'
import {
  chatEntry,
  chatLine,
  chatTimeline,
  footError,
  noticeActions,
  noticeOpenRequest,
  noticeTitle,
  reachesSophia,
  receiveChat,
  receiveNotice,
  waitsOnRoom,
  type ChatMoment,
  type ChatTurn,
} from './chat-view.ts'
const turn: ChatTurn = {
  id: 'a',
  exchangeId: 'e',
  text: 'Synthetic question',
  reply: '',
  sequence: -1,
  state: 'sending',
  reason: null,
  at: 1,
}
it('a duplicate packet or another exchange cannot duplicate a visible reply', () => {
  const accepted = receiveChat([turn], { id: 'a', exchangeId: 'e', kind: 'accepted', sequence: 0, text: '' })
  const packet = { id: 'a', exchangeId: 'e', kind: 'delta' as const, sequence: 1, text: 'Synthetic reply' }
  const received = receiveChat(accepted, packet)
  assert.deepEqual(receiveChat(received, packet), received)
  assert.deepEqual(receiveChat(received, { ...packet, exchangeId: 'another', sequence: 2 }), received)
})
it('a refused reply cannot be revived by late output', () => {
  const refused = receiveChat([turn], {
    id: 'a',
    exchangeId: 'e',
    kind: 'refused',
    sequence: 1,
    text: 'Conversation paused.',
  })
  assert.deepEqual(
    receiveChat(refused, { id: 'a', exchangeId: 'e', kind: 'delta', sequence: 2, text: 'Late content' }),
    refused,
  )
})

const sophia = (over: Partial<SophiaPresence> = {}): SophiaPresence => ({
  exchangeId: 'e',
  exchange: 'open',
  pauseReason: null,
  voice: 'ready',
  inputActorId: 'me',
  inputEpoch: 1,
  playbackEpoch: null,
  observationEpoch: null,
  allowVision: false,
  looking: null,
  reason: null,
  reportedAt: null,
  ...over,
})
const typing: ChatMoment = { starting: false, live: true, mine: true, textMode: true }

it('the chat offers one way in until there is a conversation to type into, then only the bar', () => {
  assert.equal(chatEntry(false, undefined), 'start')
  assert.equal(chatEntry(true, sophia({ exchange: 'none' })), 'start')
  // Someone else opened the exchange and this person is not in the room: still the way in, which joins them
  assert.equal(chatEntry(false, sophia()), 'start')
  assert.equal(chatEntry(true, sophia()), 'bar')
  // A paused conversation is still one: the bar stays and its line says why it waits
  assert.equal(chatEntry(true, sophia({ exchange: 'paused', pauseReason: 'holder_left' })), 'bar')
})

it('the line above the bar says why Send waits, one reason at a time', () => {
  assert.equal(chatLine(sophia(), { ...typing, starting: true }), 'Connecting to Sophia…')
  assert.equal(
    chatLine(sophia({ exchange: 'paused', pauseReason: 'guest' }), typing),
    'Sophia is paused while a guest is here.',
  )
  assert.equal(
    chatLine(sophia({ exchange: 'paused', pauseReason: 'holder_left' }), typing),
    'Sophia is paused. Resume in the room.',
  )
  assert.equal(chatLine(sophia(), { ...typing, live: false }), 'Reconnecting to the room…')
  assert.equal(chatLine(sophia({ voice: 'unavailable' }), typing), 'Sophia is unavailable right now.')
  assert.equal(chatLine(sophia({ voice: 'recovering' }), typing), 'Reconnecting to Sophia…')
  assert.equal(chatLine(sophia({ voice: 'connecting' }), typing), 'Sophia is joining…')
  assert.equal(chatLine(sophia({ voice: 'not_connected' }), typing), 'Sophia is joining…')
  assert.equal(chatLine(sophia(), { ...typing, mine: false }), 'Take the floor to message Sophia.')
})

it('once Send can work the line only names text mode, and says nothing in voice mode', () => {
  assert.equal(chatLine(sophia(), typing), 'Typing to Sophia')
  assert.equal(chatLine(sophia(), { ...typing, textMode: false }), null)
})

it('says why the call ended before an older chat error, and drops the chat’s errors out of the call', () => {
  const ended = 'You were disconnected from the room.'
  const sendFailed = 'Delivery unconfirmed. Nothing is resent automatically.'
  assert.deepEqual(footError(ended, false, sendFailed, null), { text: ended, live: false }, 'the dock announces it')
  assert.equal(footError(null, false, sendFailed, 'start failed'), null, 'left on purpose: nothing old stays')
  assert.deepEqual(footError(null, true, sendFailed, 'start failed'), { text: sendFailed, live: true })
  assert.deepEqual(footError(null, true, null, 'start failed'), { text: 'start failed', live: true })
})

it('knows when the line waits on the room’s dock (taking the floor, Resume), so the room can be shown', () => {
  assert.equal(waitsOnRoom(sophia(), { ...typing, mine: false }), true, 'Take the floor to message Sophia.')
  assert.equal(waitsOnRoom(sophia({ exchange: 'paused', pauseReason: 'holder_left' }), typing), true, 'Resume')
  assert.equal(
    waitsOnRoom(sophia({ exchange: 'paused', pauseReason: 'guest' }), typing),
    false,
    'a guest: nothing to press',
  )
  assert.equal(waitsOnRoom(sophia(), typing), false, 'typing reaches her')
  assert.equal(waitsOnRoom(sophia(), { ...typing, mine: false, live: false }), false, 'reconnecting')
  assert.equal(waitsOnRoom(sophia({ voice: 'connecting' }), { ...typing, mine: false }), false, 'she is joining')
  assert.equal(waitsOnRoom(sophia(), { ...typing, mine: false, starting: true }), false)
})

it('typed words reach Sophia only with her exchange open and her voice ready', () => {
  assert.equal(reachesSophia(sophia()), true)
  assert.equal(reachesSophia(undefined), false)
  assert.equal(reachesSophia(sophia({ exchange: 'none' })), false)
  assert.equal(reachesSophia(sophia({ exchange: 'paused', pauseReason: 'guest' })), false)
  assert.equal(reachesSophia(sophia({ voice: 'unavailable' })), false)
  assert.equal(reachesSophia(sophia({ voice: 'connecting' })), false)
})

const notice = (taskId: string, resultRevision = 1): ChatNotice => ({
  kind: 'notice',
  id: '33333333-3333-4333-8333-333333333333',
  exchangeId: 'e',
  taskId,
  taskKind: 'research',
  resultRevision,
})

it('keeps a result notice once, where it came (SMC-M03 S6)', () => {
  const once = receiveNotice([], notice('t1'), 1)
  assert.deepEqual(
    once.map((n) => [n.key, n.at]),
    [['t1:1', 1]],
  )
  const again = receiveNotice(once, { ...notice('t1'), id: '44444444-4444-4444-8444-444444444444' }, 2)
  assert.equal(again, once, 'delivered again: the same list, so nothing renders again and Chat is not marked')
  const many = Array.from({ length: 25 }, (_, i) => `t${String(i)}`).reduce(
    (list, id, i) => receiveNotice(list, notice(id), i),
    [] as ReturnType<typeof receiveNotice>,
  )
  assert.equal(many.length, 20, 'bounded')
})

it('a task keeps one notice, its newest revision, where that came (CX-0022)', () => {
  const first = receiveNotice(receiveNotice([], notice('t1'), 1), notice('t2'), 2)
  const revised = receiveNotice(first, notice('t1', 2), 3)
  assert.deepEqual(
    revised.map((n) => [n.key, n.at]),
    [
      ['t2:1', 2],
      ['t1:2', 3],
    ],
    'the older card goes: it would open the newer files',
  )
  assert.equal(receiveNotice(revised, notice('t1', 1), 4), revised, 'an older revision changes nothing')
  assert.equal(receiveNotice(revised, notice('t1', 2), 4), revised, 'nor does the newest, again')
  const full = Array.from({ length: 20 }, (_, i) => `t${String(i)}`).reduce(
    (list, id, i) => receiveNotice(list, notice(id), i),
    [] as ReturnType<typeof receiveNotice>,
  )
  const superseded = receiveNotice(full, notice('t0', 2), 21)
  assert.equal(superseded.length, 20, 'a revision takes its own place, so no other card drops out')
  assert.equal(superseded[0]?.taskId, 't1')
})

const spoken = (id: string, speaker: ChatCaption['speaker']): ChatCaption => ({
  kind: 'caption',
  id,
  exchangeId: 'e',
  speaker,
  actorId: speaker === 'member' ? 'me' : null,
  sequence: 1,
  state: 'final',
  text: 'Synthetic spoken words',
})

const label = (e: ReturnType<typeof chatTimeline>[number]) =>
  e.type === 'turn' ? e.turn.id : e.type === 'notice' ? e.notice.taskId : e.caption.id

it('one timeline in arrival order: spoken exchanges, typed turns and cards, each where it came (CX-0023)', () => {
  const captions = [
    spoken('heard-1', 'member'),
    spoken('said-1', 'sophia'),
    spoken('heard-2', 'member'),
    spoken('said-2', 'sophia'),
  ].reduce((list, c, i) => receiveCaption(list, c, [1, 2, 5, 6][i] ?? 0), [] as ReturnType<typeof receiveCaption>)
  const typed: ChatTurn = { ...turn, id: 'typed', at: 3 }
  const notices = [...receiveNotice([], notice('t1'), 4), ...receiveNotice([], notice('t2'), 7)]
  assert.deepEqual(chatTimeline([typed], notices, captions).map(label), [
    'heard-1',
    'said-1',
    'typed',
    't1',
    'heard-2',
    'said-2',
    't2',
  ])
  assert.deepEqual(
    chatTimeline([typed], notices).map(label),
    ['typed', 't1', 't2'],
    'a card keeps its place when the turn before it is no longer kept',
  )
})

it('words a notice by its kind only', () => {
  assert.equal(noticeTitle('research'), 'Research report ready')
  assert.equal(noticeTitle('draft_brief'), 'Brief ready')
  assert.equal(noticeTitle('design'), 'HTML page ready')
  assert.equal(noticeTitle('something_later'), 'Result ready')
})

it('a notice opens and saves the same file, the PDF when there is one, with the Markdown beside it (RF-0020)', () => {
  const md = { format: 'markdown' as const, artifactVersionId: 'v2' }
  const pdf = { format: 'pdf' as const, artifactVersionId: 'v2' }
  assert.deepEqual(noticeActions([md, pdf]), { primary: pdf, markdown: md, page: null })
  assert.deepEqual(noticeActions([pdf, md]), { primary: pdf, markdown: md, page: null })
  assert.deepEqual(
    noticeActions([md]),
    { primary: md, markdown: null, page: null },
    'no second button for the same file',
  )
  assert.deepEqual(noticeActions([]), { primary: null, markdown: null, page: null })
})

it('a notice offers the HTML page only when the task stored a designed one, never from the Markdown (SDD-01)', () => {
  const md = { format: 'markdown' as const, artifactVersionId: 'v4', sourceId: 'm' }
  const pdf = { format: 'pdf' as const, artifactVersionId: 'v4', sourceId: 'p' }
  const html = { format: 'html' as const, artifactVersionId: 'v4', sourceId: 'h' }
  assert.equal(noticeActions([md, pdf, html]).page, html, 'the stored page, beside a PDF')
  assert.equal(noticeActions([md, html]).primary, md, 'Open and Download keep the report')
  assert.equal(noticeActions([md]).page, null, 'a Markdown report offers no page')
  assert.deepEqual(noticeOpenRequest('a1', html), { artifactId: 'a1', versionId: 'v4', format: 'html' })
})

it('Open asks the viewer for the file Download saves: its version and its format, the PDF named (RF-0020)', () => {
  const md = { format: 'markdown' as const, artifactVersionId: 'v3', sourceId: 'm' }
  const pdf = { format: 'pdf' as const, artifactVersionId: 'v3', sourceId: 'p' }
  const { primary, markdown } = noticeActions([md, pdf])
  assert.equal(primary?.sourceId, 'p', 'Download saves the PDF')
  assert.deepEqual(primary && noticeOpenRequest('a1', primary), { artifactId: 'a1', versionId: 'v3', format: 'pdf' })
  assert.deepEqual(markdown && noticeOpenRequest('a1', markdown), {
    artifactId: 'a1',
    versionId: 'v3',
    format: 'markdown',
  })
})
