// Copying the personal space as text (Your data). Safari allows a copy only while the press itself is handled, and the
// export comes later: there the clipboard is handed the text as a promise there and then; elsewhere it is copied once
// fetched. Either way nothing is copied when the padlock shut while the export was on its way: nothing personal is kept
// while it is shut, the clipboard included.

/** What the copy writes to: the text, or (Safari) the text still being fetched. */
export interface Clip {
  writeText: (text: string) => Promise<void>
  writeLater?: (text: Promise<string>) => Promise<void>
}

/** The padlock shut while the export was fetched: nothing was copied, and the locked sheet already says why. */
export class CopyCalledOff extends Error {}

/**
 * Copies the text `load` fetches, if the space is still open (`stillOpen`) when it arrives. A failed fetch says so as
 * itself, not as a blocked clipboard.
 */
export async function copyFetched(load: () => Promise<string>, clip: Clip, stillOpen: () => boolean): Promise<void> {
  const fetched = async () => {
    const text = await load()
    if (!stillOpen()) throw new CopyCalledOff('The personal space locked before the copy')
    return text
  }
  if (!clip.writeLater) {
    await clip.writeText(await fetched())
    return
  }
  const failure: { error?: unknown } = {}
  const text = fetched().catch((err: unknown) => {
    failure.error = err
    throw err
  })
  try {
    await clip.writeLater(text)
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
