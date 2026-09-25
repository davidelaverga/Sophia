import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { escapeHtml, icsEvent, inviteEmail, personName, sessionWhen } from './invite-email.ts'
import { deriveToken, joinUrl, linkFor, tokenHash } from './invite-token.ts'

const cfg = { secret: 'unit-test-secret-at-least-32-characters!!', studioUrl: 'https://studio.example.com/' }
const session = {
  title: 'Weekly, with Sophia; <b>',
  startsAt: '2026-10-01T15:00:00.000Z',
  endsAt: '2026-10-01T16:00:00.000Z',
  timeZone: 'America/Bogota',
}

describe('invitation links', () => {
  it('derive the same token for the same invitation and version, a new one per version', () => {
    const id = randomUUID()
    assert.equal(deriveToken(cfg.secret, id, 1), deriveToken(cfg.secret, id, 1))
    assert.notEqual(deriveToken(cfg.secret, id, 1), deriveToken(cfg.secret, id, 2))
    assert.notEqual(deriveToken(cfg.secret, id, 1), deriveToken(`${cfg.secret}x`, id, 1))
    assert.match(deriveToken(cfg.secret, id, 1), /^[A-Za-z0-9_-]{43}$/)
  })

  it('put the token in the fragment, where no server or log sees it, and store only its hash', () => {
    const { url, hash } = linkFor(cfg, randomUUID(), 1)
    assert.match(url, /^https:\/\/studio\.example\.com\/join#[A-Za-z0-9_-]{43}$/)
    assert.deepEqual(hash, tokenHash(url.split('#')[1] ?? ''))
    assert.equal(hash.length, 32)
    assert.equal(joinUrl({ ...cfg, studioUrl: 'http://localhost:5173' }, 'abc'), 'http://localhost:5173/join#abc')
  })
})

describe('invitation email', () => {
  const base = {
    invitationId: randomUUID(),
    inviterName: 'luis.eduardo@sophia.test',
    projectTitle: 'Q4 <launch> & "plan"',
    email: 'ana@example.com',
    url: 'https://studio.example.com/join#tok',
    session: null,
  }

  it('names people the way the Studio does', () => {
    assert.deepEqual(
      [personName('luis.eduardo@x.com'), personName(null), personName('Ana')],
      ['Luis', 'Someone', 'Ana'],
    )
  })

  it('invites a guest to the room and escapes every word it did not write', () => {
    const mail = inviteEmail({ ...base, kind: 'guest', role: null })
    assert.equal(mail.subject, 'Luis invited you to a room in Sophia')
    assert.ok(mail.html.includes('Join the room'))
    assert.ok(mail.html.includes(escapeHtml('“Q4 <launch> & "plan"”')))
    assert.ok(!mail.html.includes('<launch>'))
    assert.ok(mail.text.includes(`Join the room: ${base.url}`))
    assert.equal(mail.ics, null)
  })

  it('binds a member invitation to its email and adds the session to the calendar', () => {
    const mail = inviteEmail({ ...base, kind: 'member', role: 'viewer', session })
    assert.ok(mail.html.includes('a viewer'))
    assert.ok(mail.html.includes('ana@example.com'))
    assert.ok(mail.html.includes(escapeHtml(sessionWhen(session))))
    assert.equal(sessionWhen(session), 'Thursday, October 1 · 10:00 – 11:00 (America/Bogota)')
    assert.ok(mail.ics?.includes('DTSTART:20261001T150000Z'))
    assert.ok(mail.ics?.includes('SUMMARY:Weekly\\, with Sophia\\; <b>'))
  })

  it('writes RFC 5545 lines: CRLF endings, folded under 76 characters', () => {
    const ics = icsEvent({
      uid: 'x@sophia',
      session,
      url: `https://s.example.com/join#${'a'.repeat(120)}`,
      description: 'd',
    })
    const lines = ics.split('\r\n')
    assert.equal(lines.at(-1), '')
    assert.ok(lines.every((l) => l.length <= 75))
    assert.ok(lines.some((l) => l.startsWith(' ')))
  })
})
