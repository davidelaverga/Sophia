import assert from 'node:assert/strict'
import { test } from 'node:test'
import { followHere, inProject, type Here, type InProject } from './in-place.ts'
import type { View } from './route.ts'

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

/** A shell at Conversations with a report open: what following does, in order. `pushes`: the router's view push. */
function shell(pushes: boolean, shown: string | null = REPORT) {
  const did: string[] = []
  let path = `/p/${PROJECT}/conversations`
  const here: Here = {
    view: 'conversations',
    show: (view: View) => {
      did.push(`show ${view}`)
      if (pushes) path = `/p/${PROJECT}/${view}`
    },
    path: () => path,
    shown,
    open: (report) => did.push(`open ${report.artifactId}`),
    leave: (push) => did.push(push ? 'leave in a new entry' : 'leave in the entry on screen'),
    name: (hash) => did.push(`name ${hash}`),
  }
  return { did, here }
}

const link = (path: string): InProject => {
  const followed = at(path)
  assert.ok(followed)
  return followed
}

test('beside a report, a link within the view closes it in a new entry, then names its fragment there', () => {
  const { did, here } = shell(true)
  followHere(link(`/p/${PROJECT}/conversations#conversation-c2`), here)
  assert.deepEqual(did, ['leave in a new entry', 'name #conversation-c2'])
})

test('beside a report, a link to another view closes it in the entry the router pushed for that view', () => {
  const { did, here } = shell(true)
  followHere(link(`/p/${PROJECT}/goals#goal-g1`), here)
  assert.deepEqual(did, ['show goals', 'leave in the entry on screen', 'name #goal-g1'])
})

test('a view change that pushes nothing (a page without the router) closes the report in a new entry', () => {
  const { did, here } = shell(false)
  followHere(link(`/p/${PROJECT}/goals`), here)
  assert.deepEqual(did, ['show goals', 'leave in a new entry'])
})

test('a link that names a report opens it, and with none on screen nothing closes', () => {
  const opened = shell(true)
  followHere(link(`/p/${PROJECT}/knowledge?report=${REPORT}`), opened.here)
  assert.deepEqual(opened.did, ['show knowledge', `open ${REPORT}`])
  const none = shell(true, null)
  followHere(link(`/p/${PROJECT}/conversations#conversation-c2`), none.here)
  assert.deepEqual(none.did, ['name #conversation-c2'])
})
