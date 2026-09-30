import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { initialOf, profileFromMetadata } from './profile.ts'

describe('profileFromMetadata', () => {
  it('reads Google and GitHub claims', () => {
    assert.deepEqual(
      profileFromMetadata(
        { full_name: 'Ada Lovelace', picture: 'https://lh3.googleusercontent.com/a/x' },
        'ada@example.com',
      ),
      { displayName: 'Ada Lovelace', avatarUrl: 'https://lh3.googleusercontent.com/a/x' },
    )
    assert.deepEqual(
      profileFromMetadata(
        { user_name: 'octocat', avatar_url: 'https://avatars.githubusercontent.com/u/1' },
        'o@example.com',
      ),
      { displayName: 'octocat', avatarUrl: 'https://avatars.githubusercontent.com/u/1' },
    )
  })

  it('prefers a full name to a handle', () => {
    assert.equal(
      profileFromMetadata({ user_name: 'octocat', name: 'The Octocat' }, 'o@x.com').displayName,
      'The Octocat',
    )
  })

  it('has nothing for email sign-in, blank values or a name that is the email', () => {
    assert.deepEqual(profileFromMetadata({}, 'a@b.com'), { displayName: null, avatarUrl: null })
    assert.deepEqual(profileFromMetadata(null, 'a@b.com'), { displayName: null, avatarUrl: null })
    assert.equal(profileFromMetadata({ full_name: '  ' }, 'a@b.com').displayName, null)
    assert.equal(profileFromMetadata({ name: 'A@B.com' }, 'a@b.com').displayName, null)
  })

  it('keeps only https pictures', () => {
    for (const bad of ['http://x.test/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', 'not a url'])
      assert.equal(profileFromMetadata({ avatar_url: bad }, 'a@b.com').avatarUrl, null)
  })
})

describe('initialOf', () => {
  it('uses the name, else the email', () => {
    assert.equal(initialOf('ada Lovelace', 'z@x.com'), 'A')
    assert.equal(initialOf(null, 'zoe@x.com'), 'Z')
  })
})
