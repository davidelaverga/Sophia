import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { scrubBreadcrumb, scrubEvent, scrubUrl } from './crash-scrub.ts'

describe('what a crash report may carry (crash-feedback.md)', () => {
  it('keeps an address’s origin and path; its query and fragment (an invitation’s token) go', () => {
    assert.equal(scrubUrl('https://sophia.app/join?x=1#token-abc'), 'https://sophia.app/join')
    assert.equal(scrubUrl('/p/1234/goals?q=secret'), '/p/1234/goals')
  })

  it('drops console breadcrumbs, and blanks the attribute values a click names', () => {
    assert.equal(scrubBreadcrumb({ category: 'console', message: 'Marco said hi' }), null)
    assert.deepEqual(
      scrubBreadcrumb({ category: 'ui.click', message: 'button.round[aria-label="Actions for Marco"]' }),
      {
        category: 'ui.click',
        message: 'button.round[aria-label="…"]',
      },
    )
    assert.deepEqual(
      scrubBreadcrumb({ category: 'fetch', data: { url: 'https://api.test/x?q=words', method: 'GET' } }),
      { category: 'fetch', data: { url: 'https://api.test/x', method: 'GET' } },
    )
  })

  it('leaves no user, headers or cookies on an event, and scrubs its address', () => {
    const event = scrubEvent({
      user: { email: 'a@b.c' },
      request: { url: 'https://sophia.app/join#t', headers: { Authorization: 'x' }, cookies: { a: 'b' } },
    })
    assert.deepEqual(event, { request: { url: 'https://sophia.app/join' } })
  })
})
