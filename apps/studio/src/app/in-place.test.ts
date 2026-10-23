import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inProject } from './in-place.ts'

const ORIGIN = 'https://studio.example'
const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const REPORT = '00000000-0000-4000-8000-0000000000b1'
const at = (path: string) => inProject(`${ORIGIN}${path}`, ORIGIN, PROJECT)

test('a link to this project: its view, its fragment and its report', () => {
  assert.deepEqual(at(`/p/${PROJECT}/conversations#conversation-c2`), {
    view: 'conversations',
    hash: '#conversation-c2',
    report: null,
  })
  assert.deepEqual(at(`/p/${PROJECT.toUpperCase()}`), { view: 'studio', hash: '', report: null })
  assert.deepEqual(at(`/p/${PROJECT}/knowledge?report=${REPORT}`), {
    view: 'knowledge',
    hash: '',
    report: { artifactId: REPORT, versionId: null, size: 'side', format: 'markdown' },
  })
})

test('anything else is not followed here: another origin, project or place, an invitation, a passage', () => {
  assert.equal(inProject(`https://elsewhere.example/p/${PROJECT}/goals`, ORIGIN, PROJECT), null)
  assert.equal(at('/p/00000000-0000-4000-8000-0000000000ab/goals'), null)
  assert.equal(at('/personal'), null)
  assert.equal(at('/join#token'), null)
  assert.equal(at(`/p/${PROJECT}/knowledge?report=${REPORT}&passage=p1`), null)
  assert.equal(at(`/p/${PROJECT}/goals?utm=x`), null)
  assert.equal(inProject('not an address', ORIGIN, PROJECT), null)
})
