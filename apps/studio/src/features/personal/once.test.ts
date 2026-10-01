import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../../api/client.ts'
import { once, RETRY_WINDOW_MS } from './once.ts'

const noAnswer = () => new ApiError(0, 'outcome_unknown', 'No reply', 'same_admission_key')

/** A write that fails with no answer the first `fails` times, recording each key and when the clock said it ran. */
function write(fails: number) {
  const keys: string[] = []
  return {
    keys,
    run: (key: string) => {
      keys.push(key)
      return keys.length <= fails ? Promise.reject(noAnswer()) : Promise.resolve({ key })
    },
  }
}

describe('a personal write given its key', () => {
  it('goes under that key, also when sent once more: the same draft sent from two tabs is one message', async () => {
    const w = write(1)
    await once(w.run, () => 0, 'the-draft-key')
    assert.deepEqual(w.keys, ['the-draft-key', 'the-draft-key'])
  })
})

describe('a personal write with no answer', () => {
  it('is sent once more, under the same key, while its first attempt is recent', async () => {
    const w = write(1)
    const t = 1_000
    assert.deepEqual(await once(w.run, () => t), { key: w.keys[0] })
    assert.equal(w.keys.length, 2)
    assert.equal(w.keys[0], w.keys[1])
  })

  it('is never sent again once two minutes have passed (a device that slept): its record may be gone by then', async () => {
    const w = write(1)
    let t = 0
    const run = (key: string) => {
      t += RETRY_WINDOW_MS
      return w.run(key)
    }
    await assert.rejects(
      once(run, () => t),
      (err: unknown) => err instanceof ApiError && err.code === 'outcome_unknown',
    )
    assert.equal(w.keys.length, 1)
  })

  it('is not sent again after a refusal', async () => {
    const keys: string[] = []
    const refused = (key: string) => {
      keys.push(key)
      return Promise.reject(new ApiError(409, 'stale_revision', 'x', 'never'))
    }
    await assert.rejects(once(refused, () => 0))
    assert.equal(keys.length, 1)
  })
})
