import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mailHome, plausibleEmail } from './mail-home.ts'

describe('mailHome', () => {
  it('opens the inbox of a common address, by its domain, whatever its case', () => {
    assert.deepEqual(mailHome('luis@gmail.com'), { name: 'Gmail', url: 'https://mail.google.com/' })
    assert.equal(mailHome(' Luis@Hotmail.com ')?.name, 'Outlook')
    assert.equal(mailHome('a@me.com')?.name, 'iCloud Mail')
  })

  it('guesses nothing for any other domain', () => {
    assert.equal(mailHome('luis@sophia.test'), null)
    assert.equal(mailHome('luis@gmail.com.evil.test'), null)
    assert.equal(mailHome('not an address'), null)
  })
})

describe('plausibleEmail', () => {
  it('needs a name, an @ and a domain with a dot', () => {
    assert.equal(plausibleEmail('luis@sophia.test'), true)
    assert.equal(plausibleEmail(' luis@sophia.test '), true)
    for (const bad of ['luis@', '@sophia.test', 'luis@sophia', 'luis sophia@x.test', '']) {
      assert.equal(plausibleEmail(bad), false, bad)
    }
  })
})
