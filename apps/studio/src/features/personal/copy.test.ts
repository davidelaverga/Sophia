import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { copyFetched, CopyCalledOff, type Clip } from './copy.ts'

/**
 * A clipboard that records what it was given; `later` hands it the text as a promise (Safari's way). `during` runs
 * while the browser writes, after the text was handed over (a slow write, a prompt).
 */
function clipboard(later: boolean, during: () => void = () => undefined) {
  const written: string[] = []
  const clip: Clip = {
    writeText: (text) => {
      written.push(text)
      during()
      return Promise.resolve()
    },
    ...(later
      ? {
          writeLater: async (text: Promise<string>) => {
            written.push(await text)
            during()
          },
        }
      : {}),
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

    it(`takes back a write that settles after the padlock shut or the sheet went (${way})`, async () => {
      let open = true
      const { clip, written } = clipboard(later, () => {
        open = false // the padlock shut, or the sheet closed, while the browser wrote what it was handed
      })
      await assert.rejects(
        copyFetched(
          () => Promise.resolve('Everything'),
          clip,
          () => open,
        ),
        CopyCalledOff,
      )
      assert.deepEqual(written, ['Everything', ''])
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
