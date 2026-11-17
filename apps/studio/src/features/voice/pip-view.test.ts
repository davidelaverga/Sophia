import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { RoomParticipant } from './room-view.ts'
import { pipShows, pipWay } from './pip-view.ts'

const person = (identity: string, name: string, over: Partial<RoomParticipant> = {}): RoomParticipant => ({
  identity,
  name,
  speaking: false,
  micOn: true,
  cameraOn: false,
  screenOn: false,
  local: false,
  standing: 'editor',
  ...over,
})
const feed = (identity: string, source: 'camera' | 'screen') => ({ identity, source })

const ana = person('a', 'Ana Ruiz', { local: true })
const marco = person('m', 'Marco Bellini')
const lucia = person('l', 'Lucía Gómez')

describe('pipShows', () => {
  it('a shared screen before anyone, the newest, captioned as the stage captions it', () => {
    const shown = pipShows([ana, marco, { ...lucia, speaking: true }], [feed('m', 'screen'), feed('l', 'screen')])
    assert.equal(shown?.person.identity, 'l')
    assert.deepEqual(shown?.feed, feed('l', 'screen'))
    assert.equal(shown?.caption, 'Lucía’s screen')
  })

  it('else the one speaking, another before you, with their camera', () => {
    const people = [{ ...ana, speaking: true }, marco, { ...lucia, speaking: true }]
    const shown = pipShows(people, [feed('l', 'camera'), feed('a', 'camera')])
    assert.equal(shown?.person.identity, 'l')
    assert.deepEqual(shown?.feed, feed('l', 'camera'))
    assert.equal(shown?.caption, 'Lucía')
  })

  it('you last: speaking with another in the call, the other shows (a 1:1 never flips to you)', () => {
    assert.equal(pipShows([{ ...ana, speaking: true }, marco], [])?.person.identity, 'm')
    assert.equal(pipShows([{ ...ana, speaking: true }, marco], [feed('a', 'camera')])?.person.identity, 'm')
  })

  it('you alone, said as you', () => {
    const shown = pipShows([{ ...ana, speaking: true }], [])
    assert.equal(shown?.person.identity, 'a')
    assert.equal(shown?.feed, undefined)
    assert.equal(shown?.caption, 'Ana · you')
  })

  it('nobody speaking: another with a camera, else another, else you', () => {
    assert.equal(pipShows([ana, marco, lucia], [feed('l', 'camera')])?.person.identity, 'l')
    assert.equal(pipShows([ana, marco, lucia], [feed('a', 'camera')])?.person.identity, 'm')
    assert.equal(pipShows([ana], [])?.person.identity, 'a')
    assert.equal(pipShows([], []), null)
  })
})

describe('pipWay', () => {
  it('Document Picture-in-Picture first, whatever the stage shows', () => {
    assert.equal(pipWay({ document: true, video: true }, false), 'document')
    assert.equal(pipWay({ document: true, video: false }, false), 'document')
  })

  it('video picture in picture only with a video on the stage', () => {
    assert.equal(pipWay({ document: false, video: true }, true), 'video')
    assert.equal(pipWay({ document: false, video: true }, false), null)
  })

  it('neither: none', () => {
    assert.equal(pipWay({ document: false, video: false }, true), null)
  })
})
