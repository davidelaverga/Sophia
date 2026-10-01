import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Snapshot } from '@sophia/contracts'
import {
  changedUnseen,
  chatSignature,
  focusOnOpen,
  focusStep,
  isNew,
  mergeNames,
  panelNote,
  seenNow,
  toggled,
} from './side-panel.ts'

const discussion = (ids: readonly string[]) =>
  ({ discussion: ids.map((id) => ({ id })) }) as unknown as Pick<Snapshot, 'discussion'>
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `m${from + i}`)
/** A chat of one typed turn, as far as its reply has come. */
const chat = (sequence: number, state: string) => chatSignature(discussion([]), [{ id: 't1', sequence, state }])

describe('the room side panel', () => {
  it('knows the chat by what it shows, so a new message counts even once the kept history is full', () => {
    assert.equal(chatSignature(undefined, []), null, 'a room still loading is no baseline')
    // The discussion keeps its latest 50: the 51st message drops the first, and the count stays 50.
    assert.notEqual(chatSignature(discussion(ids(1, 50)), []), chatSignature(discussion(ids(2, 51)), []))
    // The typed chat keeps its latest 100 turns the same way.
    const turns = (from: number, to: number) => ids(from, to).map((id) => ({ id, sequence: 3, state: 'complete' }))
    assert.notEqual(chatSignature(discussion([]), turns(1, 100)), chatSignature(discussion([]), turns(2, 101)))
    // A reply that begins on an earlier turn is new too; the same chat is the same signature.
    const sent = { id: 't2', sequence: -1, state: 'sending' }
    const asked = [{ id: 't1', sequence: -1, state: 'sending' }, sent]
    const replied = [{ id: 't1', sequence: 0, state: 'responding' }, sent]
    assert.notEqual(chatSignature(discussion([]), asked), chatSignature(discussion([]), replied))
    assert.equal(chatSignature(discussion(['m1']), asked), chatSignature(discussion(['m1']), [...asked]))
  })

  it('counts a reply that goes on, or ends refused or unconfirmed, behind a closed panel', () => {
    assert.notEqual(chat(1, 'responding'), chat(2, 'responding'), 'more of the same reply')
    assert.notEqual(chat(2, 'responding'), chat(3, 'complete'), 'the reply ends')
    assert.notEqual(chat(0, 'responding'), chat(0, 'unknown'), 'the reply is left unconfirmed')
    assert.equal(chat(2, 'responding'), chat(2, 'responding'))
  })

  it('points at the chat only when what it shows changed out of view, from a loaded baseline', () => {
    assert.equal(changedUnseen('b', 'a', false), true)
    assert.equal(changedUnseen('b', 'a', true), false, 'in view: nothing to point at')
    assert.equal(changedUnseen('a', 'a', false), false)
    assert.equal(changedUnseen('a', null, false), false, 'nothing seen yet')
    assert.equal(seenNow(null, 'loaded', false), 'loaded', 'the first loaded chat is the baseline, not news')
    assert.equal(seenNow('old', 'new', false), 'old')
    assert.equal(seenNow('old', 'new', true), 'new')
  })

  it('closes a panel opened twice, and swaps to another in place', () => {
    assert.equal(toggled(null, 'chat'), 'chat')
    assert.equal(toggled('chat', 'chat'), null)
    assert.equal(toggled('chat', 'brief'), 'brief')
  })

  it('marks something new only when it grew and is out of view', () => {
    assert.equal(isNew(5, 3, false), true)
    assert.equal(isNew(5, 3, true), false, 'in view: nothing to point at')
    assert.equal(isNew(3, 3, false), false)
    assert.equal(isNew(null, 3, false), false, 'not read yet')
    assert.equal(isNew(5, null, false), false, 'nothing seen yet: the first read is the baseline')
  })

  it('keeps every name seen this visit, and the same map when nobody is new', () => {
    const known = mergeNames(new Map(), [{ identity: 'a', name: 'Ana' }])
    assert.equal(mergeNames(known, [{ identity: 'a', name: 'Ana' }]), known, 'nothing new: the same map')
    const later = mergeNames(known, [{ identity: 'b', name: 'Bo' }])
    assert.deepEqual(
      [...later],
      [
        ['a', 'Ana'],
        ['b', 'Bo'],
      ],
      'Ana left the room and keeps her name',
    )
    assert.equal(mergeNames(later, [{ identity: 'b', name: 'Bob' }]).get('b'), 'Bob', 'a renamed person is renamed')
  })

  it('puts the focus in the message bar, never on Chat with Sophia', () => {
    assert.equal(focusOnOpen('chat', true, 'bar'), 'bar')
    assert.equal(focusOnOpen('chat', true, 'start'), 'tab', 'Space on a focused Chat with Sophia would start the chat')
    assert.equal(focusOnOpen('chat', false, 'bar'), 'tab', 'no keyboard jumps up on a phone')
    assert.equal(focusOnOpen('brief', true, null), 'tab')
  })

  it('hands the focus back to the toggle that opened the panel, also after another tab was chosen', () => {
    const opened = focusStep({ open: null, opener: null }, 'chat')
    assert.deepEqual(opened.move, { in: 'chat' })
    const switched = focusStep(opened.next, 'brief')
    assert.equal(switched.move, null, 'choosing a tab moves nothing')
    assert.deepEqual(focusStep(switched.next, null).move, { back: 'chat' }, 'Chat opened it, so Chat gets it back')
  })

  it('says why the call ended over the Brief tab, where the chat’s foot is out of sight', () => {
    const ended = 'You joined from another tab or device, so this one left the call.'
    assert.equal(panelNote('brief', null, ended), ended)
    assert.equal(panelNote('chat', null, ended), null, 'the chat’s foot says it')
    assert.equal(panelNote('chat', 'Microphone blocked.', ended), 'Microphone blocked.')
    assert.equal(panelNote(null, null, null), null)
  })
})
