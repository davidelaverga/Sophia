import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  copyFetched,
  CopyCalledOff,
  CopyStillWriting,
  CopyUnconfirmed,
  copyWords,
  eraseAfterWrites,
  ErasureWaits,
  stillWriting,
  WRITE_WAIT_MS,
  type Clip,
} from './copy.ts'

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

/** A write left unanswered until its `list` is released. */
const heldIn = (list: (() => void)[]) => new Promise<void>((resolve) => list.push(resolve))
const releaseAll = (list: (() => void)[]) => () => {
  for (const one of list.splice(0)) one()
}

/**
 * A clipboard that doesn't answer (a permission asked and left, a bridge that hangs) until `answer()`: it notes what it
 * was handed. The emptying a take-back asks for is answered at once, refused (the page not focused), or held until
 * `answerEmptying()`.
 */
function silent(later: boolean, emptying: 'answered' | 'refused' | 'held' = 'answered') {
  const written: string[] = []
  const held: (() => void)[] = []
  const heldEmptying: (() => void)[] = []
  const emptied = {
    answered: () => Promise.resolve(),
    refused: () => Promise.reject(new Error('NotAllowedError: the page is not focused')),
    held: () => heldIn(heldEmptying),
  }[emptying]
  const clip: Clip = {
    writeText: (text) => {
      written.push(text)
      return text ? heldIn(held) : emptied()
    },
    ...(later
      ? {
          writeLater: (text: Promise<string>) => {
            void text.then(
              (t) => written.push(t),
              () => undefined,
            )
            return heldIn(held)
          },
        }
      : {}),
  }
  return { clip, written, answer: releaseAll(held), answerEmptying: releaseAll(heldEmptying) }
}

/** Whether `p` has settled once what is due now has run (promise callbacks, and timers a check ticked). */
async function settled(p: Promise<unknown>): Promise<boolean> {
  let done = false
  p.then(
    () => (done = true),
    () => (done = true),
  )
  await flush()
  return done
}

/** An export slower than the browser's wait (each page has its own limit, api/client.ts). */
const slowExport = () => new Promise<string>((resolve) => setTimeout(() => resolve('Everything'), WRITE_WAIT_MS * 3))

const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve))
}

describe('copying the space as text, when the browser never answers', () => {
  for (const later of [false, true]) {
    const way = later ? 'handed as a promise' : 'once fetched'
    it(`is said unconfirmed once the browser's wait is over, starts no other, and says it landed (${way})`, async (t) => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const { clip, written, answer } = silent(later)
      let landed = 0
      const copy = copyFetched(
        () => Promise.resolve('Everything'),
        clip,
        () => true,
        () => landed++,
      )
      copy.catch(() => undefined)
      assert.equal(await settled(copy), false, 'still within the wait')
      assert.equal(stillWriting(), true, 'counted from the press, not from the wait')
      t.mock.timers.tick(WRITE_WAIT_MS)
      assert.equal(await settled(copy), true)
      await assert.rejects(copy, CopyUnconfirmed)
      // The wait is only what the page says: the write is still the browser's, however long it takes.
      t.mock.timers.tick(3_600_000)
      await flush()
      assert.equal(stillWriting(), true, 'an erasure still waits')
      // While it is unanswered no second write starts.
      await assert.rejects(
        copyFetched(
          () => Promise.resolve('Again'),
          clip,
          () => true,
        ),
        CopyStillWriting,
      )
      assert.deepEqual(written, ['Everything'])
      // It lands with the space still open: said so, and the next copy (or an erasure) goes.
      answer()
      await flush()
      assert.equal(landed, 1)
      assert.equal(stillWriting(), false)
      const next = copyFetched(
        () => Promise.resolve('Again'),
        clip,
        () => true,
      )
      await flush()
      answer()
      await next
      assert.deepEqual(written, ['Everything', 'Again'])
    })

    for (const emptying of ['answered', 'refused'] as const) {
      it(`takes back a write that lands after its wait once the space went, its emptying ${emptying} (${way})`, async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] })
        const { clip, written, answer } = silent(later, emptying)
        let open = true
        let landed = 0
        const copy = copyFetched(
          () => Promise.resolve('Everything'),
          clip,
          () => open,
          () => landed++,
        )
        copy.catch(() => undefined)
        await flush()
        t.mock.timers.tick(WRITE_WAIT_MS)
        await assert.rejects(copy, CopyUnconfirmed)
        open = false // the padlock shut, the sheet closed, or the space was erased elsewhere, while the browser wrote
        answer()
        await flush()
        // Asked to empty, as far as the browser lets a page: whether it did stays unknown, and nothing says copied.
        assert.deepEqual(written, ['Everything', ''])
        assert.equal(landed, 0)
        // The browser answered the write and its emptying (or refused it): nothing is left unanswered.
        assert.equal(stillWriting(), false)
      })
    }

    it(`counts an emptying the browser hasn't answered: no copy starts that it could wipe (${way})`, async () => {
      const { clip, written, answer, answerEmptying } = silent(later, 'held')
      let open = true
      const copy = copyFetched(
        () => Promise.resolve('Everything'),
        clip,
        () => open,
      )
      copy.catch(() => undefined)
      await flush()
      open = false // the sheet closed before the browser wrote (well within its wait)
      answer()
      await assert.rejects(copy, CopyCalledOff)
      assert.deepEqual(written, ['Everything', ''])
      // Its emptying is still on its way: a copy now could land before it, and be wiped by it.
      assert.equal(stillWriting(), true)
      await assert.rejects(
        copyFetched(
          () => Promise.resolve('Again'),
          clip,
          () => true,
        ),
        CopyStillWriting,
      )
      assert.deepEqual(written, ['Everything', ''])
      answerEmptying()
      await flush()
      assert.equal(stillWriting(), false)
      const next = copyFetched(
        () => Promise.resolve('Again'),
        clip,
        () => true,
      )
      await flush()
      answer()
      await next
      assert.deepEqual(written, ['Everything', '', 'Again'], 'nothing empties the clipboard after the later copy')
    })

    it(`waits for the browser from the text in hand, not from the press (${way})`, async (t) => {
      t.mock.timers.enable({ apis: ['setTimeout'] })
      const { clip, written, answer } = silent(later)
      const copy = copyFetched(slowExport, clip, () => true)
      t.mock.timers.tick(WRITE_WAIT_MS * 3) // a slow export (each page has its own limit, api/client.ts)
      await flush()
      t.mock.timers.tick(WRITE_WAIT_MS - 1)
      answer()
      await copy
      assert.deepEqual(written, ['Everything'])
    })
  }

  it('says a failed fetch at once, as itself, though the browser never answers (handed as a promise)', async () => {
    const { clip, written, answer } = silent(true)
    const failed = new Error('The export failed')
    const copy = copyFetched(
      () => Promise.reject(failed),
      clip,
      () => true,
    )
    copy.catch(() => undefined)
    assert.equal(await settled(copy), true)
    await assert.rejects(copy, (err) => err === failed)
    assert.deepEqual(written, [])
    // The browser hasn't answered the write it was handed, though its text failed: still counted, until it does.
    assert.equal(stillWriting(), true)
    answer()
    await flush()
    assert.equal(stillWriting(), false)
  })
})

describe('erasing after every Personal write is answered', () => {
  it('erases nothing while a write is unanswered past the browser’s wait, and erases once it is answered', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const { clip, answer } = silent(false)
    let open = true
    const copy = copyFetched(
      () => Promise.resolve('Everything'),
      clip,
      () => open,
    )
    copy.catch(() => undefined)
    await flush()
    open = false // its sheet closed well within the wait, and another sheet asks to erase
    let erased = 0
    const erase = eraseAfterWrites(() => Promise.resolve(erased++))
    erase.catch(() => undefined)
    // Meanwhile no copy starts, of any kind.
    await assert.rejects(
      copyWords(
        'Her words',
        () => true,
        () => undefined,
        clip,
      ),
      CopyStillWriting,
    )
    t.mock.timers.tick(WRITE_WAIT_MS)
    await assert.rejects(erase, ErasureWaits)
    assert.equal(erased, 0)
    answer()
    await flush()
    await eraseAfterWrites(() => Promise.resolve(erased++))
    assert.equal(erased, 1)
  })

  it('waits for a reply’s copy as for Your data’s', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const { clip, written, answer } = silent(false)
    let shown = true
    let late = 0
    const copy = copyWords(
      'Her words',
      () => shown,
      () => late++,
      clip,
    )
    copy.catch(() => undefined)
    let erased = 0
    const erase = eraseAfterWrites(() => Promise.resolve(erased++))
    erase.catch(() => undefined)
    await flush()
    t.mock.timers.tick(WRITE_WAIT_MS)
    await assert.rejects(erase, ErasureWaits)
    assert.equal(erased, 0)
    assert.equal(late, 1, 'said unconfirmed')
    shown = false // her turn went (the padlock, an erasure elsewhere) before the browser wrote
    answer()
    await copy
    await flush()
    assert.deepEqual(written, ['Her words', ''], 'taken back')
    await eraseAfterWrites(() => Promise.resolve(erased++))
    assert.equal(erased, 1)
  })
})
