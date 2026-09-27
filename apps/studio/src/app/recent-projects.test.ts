import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { openedLabel, RECENT_LIMIT, withRecent, type RecentProject } from './recent-projects.ts'

const project = (id: string, openedAt = 0): RecentProject => ({ id, title: `Project ${id}`, openedAt })

describe('recent projects', () => {
  it('puts the opened project first without duplicating it', () => {
    const list = withRecent([project('a'), project('b'), project('c')], project('b', 9))
    assert.deepEqual(
      list.map((p) => p.id),
      ['b', 'a', 'c'],
    )
    assert.equal(list[0]?.openedAt, 9)
  })

  it('keeps only the most recent few', () => {
    let list: RecentProject[] = []
    for (let i = 0; i < RECENT_LIMIT + 3; i++) list = withRecent(list, project(String(i)))
    assert.equal(list.length, RECENT_LIMIT)
    assert.equal(list[0]?.id, String(RECENT_LIMIT + 2))
  })

  it('says when, in days', () => {
    const now = new Date(2026, 8, 25, 10).getTime()
    assert.equal(openedLabel(new Date(2026, 8, 25, 1).getTime(), now), 'Today')
    assert.equal(openedLabel(new Date(2026, 8, 24, 23).getTime(), now), 'Yesterday')
    assert.equal(openedLabel(new Date(2026, 8, 21, 12).getTime(), now), '4 days ago')
    assert.notEqual(openedLabel(new Date(2026, 7, 1).getTime(), now), '55 days ago')
  })
})
