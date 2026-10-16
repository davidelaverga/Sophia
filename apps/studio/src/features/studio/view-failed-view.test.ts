import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VIEW_FAILED } from './view-failed-view.ts'

test('a view that failed to draw says so, why, and its two ways on (Codex P1 on #416)', () => {
  assert.deepEqual(VIEW_FAILED, {
    title: 'This view couldn’t be drawn.',
    note: 'Something in it didn’t draw as it should. The rest of the project is still here.',
    again: 'Try again',
    reload: 'Load the page again',
  })
})
