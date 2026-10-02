// Copying the personal space as text (Your data). Safari allows a copy only while the press itself is handled, and the
// export comes later: there the clipboard is handed the text as a promise there and then; elsewhere it is copied once
// fetched. Either way nothing is copied when the padlock shut while the export was on its way: nothing personal is kept
// while it is shut, the clipboard included. A write the browser already has can't be called off: one that settles
// after the padlock shut or the sheet went is taken back, as far as the browser lets a page (the clipboard emptied).

/** What the copy writes to: the text, or (Safari) the text still being fetched. */
export interface Clip {
  writeText: (text: string) => Promise<void>
  writeLater?: (text: Promise<string>) => Promise<void>
}

/** The padlock shut while the export was fetched: nothing was copied, and the locked sheet already says why. */
export class CopyCalledOff extends Error {}

/**
 * Copies the text `load` fetches, if the space is still open (`stillOpen`) when it arrives, and still once it is
 * written. A failed fetch says so as itself, not as a blocked clipboard.
 */
export async function copyFetched(load: () => Promise<string>, clip: Clip, stillOpen: () => boolean): Promise<void> {
  const fetched = async () => {
    const text = await load()
    if (!stillOpen()) throw new CopyCalledOff('The personal space locked before the copy')
    return text
  }
  await (clip.writeLater ? handedLater(fetched, clip.writeLater) : clip.writeText(await fetched()))
  if (stillOpen()) return
  await clip.writeText('').catch(() => undefined) // as far as the browser lets a page: a write needs the page focused
  throw new CopyCalledOff('The personal space locked, or its sheet went, while the copy was written')
}

/** The text handed to the clipboard as a promise (Safari's way): a failed fetch is said as itself. */
async function handedLater(fetched: () => Promise<string>, writeLater: (text: Promise<string>) => Promise<void>) {
  const failure: { error?: unknown } = {}
  const text = fetched().catch((err: unknown) => {
    failure.error = err
    throw err
  })
  try {
    await writeLater(text)
  } catch (err: unknown) {
    throw failure.error ?? err
  }
}

const writeText = (text: string) => navigator.clipboard.writeText(text)

const writeLater = (text: Promise<string>) =>
  navigator.clipboard.write([
    new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) }),
  ])

/** This browser's clipboard: the promise form where ClipboardItem is offered. */
export const browserClip = (): Clip => ('ClipboardItem' in window ? { writeText, writeLater } : { writeText })
