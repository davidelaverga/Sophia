import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { copyFetched, CopyCalledOff, type Clip } from './copy.ts'

/** A clipboard that records what it was given; `later` hands it the text as a promise (Safari's way). */
function clipboard(later: boolean) {
  const written: string[] = []
  const clip: Clip = {
    writeText: (text) => {
      written.push(text)
      return Promise.resolve()
    },
    ...(later ? { writeLater: async (text: Promise<string>) => void written.push(await text) } : {}),
  }
  return { clip, written }
}

describe('copying the space as text', () => {
  for (const later of [false, true]) {
    const way = later ? 'handed as a promise' : 'once fetched'
    it(`copies the export while the space stays open (${way})`, async () => {
      const { clip, written } = clipboard(later)
      await copyFetched(
        () => Promise.resolve('Everything'),
        clip,
        () => true,
      )
      assert.deepEqual(written, ['Everything'])
    })

    it(`copies nothing when the padlock shut while it was fetched (${way})`, async () => {
      const { clip, written } = clipboard(later)
      let open = true
      const load = () => {
        open = false // a call began, or another tab locked, while the export was on its way
        return Promise.resolve('Everything')
      }
      await assert.rejects(
        copyFetched(load, clip, () => open),
        CopyCalledOff,
      )
      assert.deepEqual(written, [])
    })

    it(`says a failed fetch as itself, not as the clipboard (${way})`, async () => {
      const { clip, written } = clipboard(later)
      const failed = new Error('The export failed')
      await assert.rejects(
        copyFetched(
          () => Promise.reject(failed),
          clip,
          () => true,
        ),
        (err) => err === failed,
      )
      assert.deepEqual(written, [])
    })
  }
})
