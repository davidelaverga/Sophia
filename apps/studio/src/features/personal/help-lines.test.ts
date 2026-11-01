import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AI_LINE, EMERGENCY, HELP_LEAD, HELP_LINES } from './help-lines.ts'

test('Sophia says she is an AI, not a person', () => {
  assert.equal(AI_LINE, 'Sophia is an AI, not a person.')
})

// R2 on the PR420 port (R2-420-COPY-1/2): 112 is claimed only where its source holds, the EU; a service's own charge is
// told apart from what a phone plan may charge; and no service promises an answer at once or the same hours everywhere.
test('says only what its sources hold: 112 in the EU, no promise a call or text costs nothing', () => {
  assert.match(EMERGENCY, /911 in the US and Canada, 112 in the EU\.$/)
  assert.doesNotMatch(EMERGENCY, /Europe/)
  assert.match(HELP_LEAD, /don’t charge for their help, though your phone plan’s usual rates may apply\.$/)
  assert.doesNotMatch(HELP_LEAD, /lines are free|talk to a person now/)
  const elsewhere = HELP_LINES.find((line) => line.where === 'Anywhere else')
  assert.equal(elsewhere?.note, 'Helplines by country; their hours and costs vary.')
})

test('every way to reach a line is a call, a text or a site, with the numbers as checked on 2026-10-16', () => {
  const hrefs = HELP_LINES.flatMap((line) => line.ways.map((way) => way.href))
  // Nothing of the person rides along: no prefilled text, query or fragment, only the number or the site.
  for (const href of hrefs) assert.match(href, /^(tel:\d+|sms:\d+|https:\/\/[a-z0-9.]+)$/)
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
