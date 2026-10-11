import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { commandsNow, indexGroups, matchCommands, registerCommands, type Offered } from './commands.ts'

const noop = () => undefined
const cmd = (id: string, words: string, over: Partial<Offered> = {}): Offered => ({
  id,
  words,
  group: 'go',
  run: noop,
  ...over,
})

const ROOM: Offered[] = [
  cmd('home', 'Home', { key: 'h' }),
  cmd('work', 'Your projects', { key: 'w' }),
  cmd('tasks', 'Go to Tasks'),
  cmd('knowledge', 'Go to Knowledge'),
  cmd('brief', 'Open the brief', { group: 'view', key: 'b' }),
  cmd('mic', 'Microphone on', { group: 'room', key: 'mod+d' }),
  cmd('palette', 'Commands', { group: 'do', key: 'mod+k' }),
]

describe('the registry', () => {
  it('keeps the parts in the order they came, drops what a part cannot run, and forgets a part that leaves', () => {
    const first = registerCommands([cmd('a', 'A'), { id: 'x', words: 'X', group: 'go', run: undefined }])
    const second = registerCommands([cmd('b', 'B')])
    assert.deepEqual(
      commandsNow().map((c) => c.id),
      ['a', 'b'],
    )
    first()
    assert.deepEqual(
      commandsNow().map((c) => c.id),
      ['b'],
    )
    second()
    assert.deepEqual(commandsNow(), [])
  })
})

describe('matching', () => {
  const ids = (q: string) => matchCommands(q, ROOM).map((c) => c.id)
  it('nothing asked: all of them, as they came', () => {
    assert.deepEqual(
      ids(''),
      ROOM.map((c) => c.id),
    )
    assert.deepEqual(
      ids('  '),
      ROOM.map((c) => c.id),
    )
  })
  it('a word starts a word of the command; from the first word first, then a later word, then the group', () => {
    assert.deepEqual(ids('tas'), ['tasks'])
    assert.deepEqual(ids('go'), ['tasks', 'knowledge', 'home', 'work']) // "Go to …" first; then the group "Go"
    assert.deepEqual(ids('kn'), ['knowledge'])
    assert.deepEqual(ids('the'), ['brief', 'mic']) // a later word ("Open the brief") before a group's ("The room")
    assert.deepEqual(ids('room'), ['mic']) // the group's word alone still finds the room's commands
  })
  it('two words both have to start something; accents and case fold', () => {
    assert.deepEqual(ids('go kno'), ['knowledge'])
    assert.deepEqual(ids('go brief'), [])
    assert.deepEqual(ids('MICRÓ'), ['mic'])
  })
  it('nothing matching: none', () => {
    assert.deepEqual(ids('zzz'), [])
  })
})

describe('the index', () => {
  it('lists the keyed commands by group in order, the keys as the platform writes them', () => {
    const groups = indexGroups(ROOM, false)
    assert.deepEqual(
      groups.map((g) => [g.label, g.rows.map((r) => `${r.words} ${r.keys}`)]),
      [
        ['Go', ['Home H', 'Your projects W']],
        ['This view', ['Open the brief B']],
        ['The room', ['Microphone on Ctrl+D']],
        ['Do', ['Commands Ctrl+K']],
      ],
    )
    assert.equal(indexGroups(ROOM, true).at(-1)?.rows[0]?.keys, '⌘K')
  })
  it('leaves out a group with no keys', () => {
    assert.deepEqual(indexGroups([cmd('tasks', 'Go to Tasks')], false), [])
  })
})
