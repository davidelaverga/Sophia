import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AI_LINE, EMERGENCY, HELP_LINES } from './help-lines.ts'

test('Sophia says she is an AI, not a person', () => {
  assert.equal(AI_LINE, 'Sophia is an AI, not a person.')
  assert.match(EMERGENCY, /911 in the US and Canada, 112 in Europe/)
})

test('every way to reach a line is a call, a text or a site, with the numbers as checked on 2026-10-16', () => {
  const hrefs = HELP_LINES.flatMap((line) => line.ways.map((way) => way.href))
  for (const href of hrefs) assert.match(href, /^(tel:|sms:|https:\/\/)/)
  assert.deepEqual(
    HELP_LINES.map((line) => [line.where, line.ways.map((way) => way.href)]),
    [
      ['United States', ['tel:988', 'sms:988', 'https://988lifeline.org']],
      ['Canada', ['tel:988', 'sms:988']],
      ['UK and Ireland', ['tel:116123']],
      ['Spain', ['tel:024']],
      ['Anywhere else', ['https://findahelpline.com']],
    ],
  )
})
