// Captions (CX-0023), pure: which caption a fragment belongs to, when one ends, how a long fragment is cut, and that
// nothing of the words stays behind. RoomSession's own fences are tested in room-session.test.ts.
import { CAPTION_PACKET_BYTES, encodeChatPacket, parseChatPacket, type ChatCaption } from '@sophia/contracts/room-chat'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { inspect } from 'node:util'
import { Captions, liveCaptionsSetting } from './captions.ts'

const EXCHANGE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const LUIS = { actorId: '11111111-1111-4111-8111-111111111111', inputEpoch: 1 }
const DAVIDE = { actorId: '22222222-2222-4222-8222-222222222222', inputEpoch: 2 }

function captions() {
  const sent: ChatCaption[] = []
  const ids: string[] = []
  const c = new Captions(EXCHANGE, (p) => sent.push(p))
  /** Each packet as `caption:speaker:sequence:state:text`, captions numbered by first sight. */
  const seen = () =>
    sent.map((p) => {
      if (!ids.includes(p.id)) ids.push(p.id)
      return `${String(ids.indexOf(p.id))}:${p.speaker}:${String(p.sequence)}:${p.state}:${p.text}`
    })
  return { c, sent, seen }
}

describe('captions (CX-0023)', () => {
  it('counts each caption’s packets from 1; a new holder or epoch ends the open caption and opens one for them', () => {
    const { c, sent, seen } = captions()
    c.heard('Synthetic', LUIS, false)
    c.heard(' words', LUIS, false)
    c.heard('Other words', DAVIDE, false)
    c.heard('', DAVIDE, true)
    c.heard('', DAVIDE, true)
    assert.deepEqual(seen(), [
      '0:member:1:partial:Synthetic',
      '0:member:2:partial: words',
      '0:member:3:final:',
      '1:member:1:partial:Other words',
      '1:member:2:final:',
    ])
    assert.deepEqual(
      sent.map((p) => p.actorId),
      [LUIS.actorId, LUIS.actorId, LUIS.actorId, DAVIDE.actorId, DAVIDE.actorId],
    )
  })

  it('Sophia’s caption ends once her reply played, or is cut off; a newer generation is a new reply', () => {
    const { c, sent, seen } = captions()
    c.spoken('First reply', 1)
    c.generated()
    c.spoken('Second reply', 1)
    c.replyEnded('played')
    c.spoken(' goes on', 1)
    c.spoken('After a stop', 2)
    c.replyEnded('stopped')
    assert.deepEqual(seen(), [
      '0:sophia:1:partial:First reply',
      '1:sophia:1:partial:Second reply',
      '0:sophia:2:final:',
      '1:sophia:2:partial: goes on',
      '1:sophia:3:interrupted:',
      '2:sophia:1:partial:After a stop',
      '2:sophia:2:interrupted:',
    ])
    assert.ok(sent.every((p) => p.actorId === null))
  })

  it('the holder’s first words in a model turn go before her caption already under way, and only those', () => {
    const { c, sent } = captions()
    c.spoken('An answer that came first', 1)
    c.heard('The question', LUIS, true)
    c.heard('More, after it', LUIS, false)
    const [reply, question, more] = [sent[0], sent[1], sent[2]]
    assert.equal(question?.before, reply?.id)
    assert.equal(more?.before, undefined, 'a member caption opened in this turn already')
    c.turnEnded(false)
    c.generated()
    c.heard('Over a reply that finished', LUIS, false)
    assert.equal(sent.at(-1)?.before, undefined, 'nothing of hers is still being generated')
    c.heard('', LUIS, true)
    c.turnEnded(false)
    c.spoken('The next answer', 2)
    const next = sent.at(-1)
    c.heard('The next question', LUIS, true)
    assert.equal(sent.at(-1)?.before, next?.id, 'each model turn: its first words go before her reply again')
  })

  it('Google’s barge-in leaves the holder’s caption open: the rest of their words are the same caption', () => {
    const { c, seen } = captions()
    c.heard('Wait, I', LUIS, false)
    c.spoken('A long answer', 1)
    c.turnEnded(false, true)
    c.heard(' meant something else', LUIS, false)
    c.heard('', LUIS, true)
    c.heard('Then', LUIS, false)
    c.turnEnded(false)
    assert.deepEqual(seen(), [
      '0:member:1:partial:Wait, I',
      '1:sophia:1:partial:A long answer',
      '0:member:2:partial: meant something else',
      '0:member:3:final:',
      '2:member:1:partial:Then',
      '2:member:2:final:',
    ])
  })

  it('a lost connection and a cut end everything open as interrupted', () => {
    const { c, seen } = captions()
    c.heard('Words', LUIS, false)
    c.spoken('Reply', 1)
    c.turnEnded(true)
    c.heard('Again', LUIS, false)
    c.spoken('Again', 1)
    c.generated()
    c.cut()
    assert.deepEqual(seen(), [
      '0:member:1:partial:Words',
      '1:sophia:1:partial:Reply',
      '0:member:2:interrupted:',
      '1:sophia:2:interrupted:',
      '2:member:1:partial:Again',
      '3:sophia:1:partial:Again',
      '2:member:2:interrupted:',
      '3:sophia:2:interrupted:',
    ])
  })

  it('cuts a long fragment by its encoded size, so every packet is read, and keeps every character', () => {
    const { c, sent } = captions()
    // Characters JSON escapes to six bytes, four-byte emoji, three-byte letters: 2000 characters of these is ~12 KB.
    const text = '\u0001'.repeat(1500) + '😀'.repeat(700) + 'あ'.repeat(1200) + 'plain'
    c.spoken(text, 1)
    assert.ok(sent.length >= 3)
    for (const p of sent) {
      assert.ok(encodeChatPacket(p).byteLength <= CAPTION_PACKET_BYTES)
      assert.deepEqual(parseChatPacket(encodeChatPacket(p)), p)
    }
    assert.equal(sent.map((p) => p.text).join(''), text)
    assert.deepEqual(
      sent.map((p) => p.sequence),
      sent.map((_, i) => i + 1),
    )
  })

  it('SOPHIA_LIVE_CAPTIONS: on unless switched off; a value not understood is off, and says so', () => {
    for (const raw of [undefined, '', 'on', 'TRUE', ' 1 ', 'yes']) {
      assert.deepEqual(liveCaptionsSetting(raw), { on: true, understood: true }, String(raw))
    }
    for (const raw of ['off', 'OFF', ' Off', 'false', '0', 'No']) {
      assert.deepEqual(liveCaptionsSetting(raw), { on: false, understood: true }, raw)
    }
    for (const raw of ['of', 'disabled', 'off;']) {
      assert.deepEqual(liveCaptionsSetting(raw), { on: false, understood: false }, raw)
    }
  })

  it('keeps no words: after a fragment, nothing of it is held', () => {
    const { c } = captions()
    c.heard('MARKER-3e5 a private remark', LUIS, false)
    c.spoken('MARKER-4f6 her reply', 1)
    assert.equal(inspect(c, { depth: 12 }).includes('MARKER'), false)
  })
})
