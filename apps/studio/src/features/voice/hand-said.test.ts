import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { gatherRaises } from './hand-said.ts'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('gatherRaises (hand-and-sync-announced.md)', () => {
  it('hands raised together are said in one line, after a short wait', async () => {
    const said: string[] = []
    const gather = gatherRaises((line) => said.push(line), 20)
    gather.raised('marco@x.com')
    gather.raised('Lucía')
    gather.raised('ana@x.com')
    assert.deepEqual(said, [])
    await wait(40)
    assert.deepEqual(said, ['Marco, Lucía and Ana raised their hands.'])
  })

  it('a raise after the wait is a line of its own; the same name twice in a wait is said once', async () => {
    const said: string[] = []
    const gather = gatherRaises((line) => said.push(line), 20)
    gather.raised('Marco')
    gather.raised('Marco')
    await wait(40)
    gather.raised('Lucía')
    await wait(40)
    assert.deepEqual(said, ['Marco raised their hand.', 'Lucía raised their hand.'])
  })

  it('cleared (the call ended), what waited is never said', async () => {
    const said: string[] = []
    const gather = gatherRaises((line) => said.push(line), 20)
    gather.raised('Marco')
    gather.clear()
    await wait(40)
    assert.deepEqual(said, [])
  })
})
