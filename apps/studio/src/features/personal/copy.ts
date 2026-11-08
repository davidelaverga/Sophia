// Copying the personal space as text (Your data). Safari allows a copy only while the press itself is handled, and the
// export comes later: there the clipboard is handed the text as a promise there and then; elsewhere it is copied once
// fetched. Either way nothing is copied when the padlock shut while the export was on its way: nothing personal is kept
// while it is shut, the clipboard included. A write the browser already has can't be called off: one that settles
// after the padlock shut or the sheet went is taken back, as far as the browser lets a page (the clipboard emptied).
// No wait for the browser is endless: one it hasn't answered in WRITE_WAIT_MS (a permission asked and left, a clipboard
// that hangs) is said unconfirmed, and watched: taken back if it lands once the space went, said copied if it lands
// while it is still there. The wait is only what the page says. Each Personal write is the browser's from the moment it
// is handed over until the browser answers it, and any emptying it led to: until then no other Personal copy starts
// and nothing is erased (`stillWriting`, `eraseAfterWrites`); an erasure refused for it hears once it is answered.

/** What the copy writes to: the text, or (Safari) the text still being fetched. */
export interface Clip {
  writeText: (text: string) => Promise<void>
  writeLater?: (text: Promise<string>) => Promise<void>
}

/** How long the browser may take to write the text in hand, as Conversations' Copy waits (COPY_WAIT_MS). */
export const WRITE_WAIT_MS = 4000

/** The padlock shut while the export was fetched: nothing was copied, and the locked sheet already says why. */
export class CopyCalledOff extends Error {}

/** The browser hasn't said, in its wait, whether it wrote the text: it may yet, and is watched. */
export class CopyUnconfirmed extends Error {}

/** An earlier Personal write is still unanswered, or an erasure is under way: no copy starts, so none crosses it. */
export class CopyStillWriting extends Error {}

/** An earlier Personal write is still unanswered once the browser's wait is over: nothing was erased. */
export class ErasureWaits extends Error {}

/**
 * Every Personal clipboard effect the browser hasn't answered yet, each from the moment it is handed over (Your data's
 * copy from its press, its export perhaps still on its way; a reply's Copy), whichever sheet or turn began it, until
 * the browser answers it and any emptying it led to. Only that answer takes one out: no wait, closed sheet or lock.
 */
const unanswered = new Set<Promise<void>>()
/** An erasure is under way (eraseAfterWrites): no Personal copy starts meanwhile. */
let erasing = false
/**
 * Told once the writes an erasure was refused for are all answered (eraseAfterWrites' `answered`), then forgotten.
 * Held in memory only, as `unanswered` is: a reload empties both.
 */
let onAnswered: (() => void) | null = null

/** `effect`, among the unanswered until it settles. */
function handedOver(effect: Promise<unknown>): void {
  const settled = effect.then(
    () => undefined,
    () => undefined,
  )
  unanswered.add(settled)
  void settled.then(() => {
    unanswered.delete(settled)
    if (!stillWriting()) heard()
  })
}

/** The last unanswered write settled: said once to a refused erasure, unless one is under way and says its own end. */
function heard(): void {
  const said = onAnswered
  onAnswered = null
  if (!erasing) said?.()
}

/** An earlier Personal write the browser still hasn't answered (it may yet land, or empty the clipboard). */
export const stillWriting = (): boolean => unanswered.size > 0

/** Whether a Personal copy may start now: nothing unanswered, and no erasure under way. */
const free = () => !stillWriting() && !erasing

/** Whether `write` settles within WRITE_WAIT_MS of `from` (the text in hand); a failure of either is thrown. */
export async function answeredInTime(
  write: Promise<void>,
  from: Promise<unknown> = Promise.resolve(),
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = from.then(
    () => new Promise<false>((resolve) => (timer = setTimeout(() => resolve(false), WRITE_WAIT_MS))),
  )
  try {
    return await Promise.race([write.then(() => true as const), late])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Erases (`erase`) only once the browser answered every Personal write handed to it, waiting for that answer no longer
 * than its wait; one still unanswered then is ErasureWaits, and nothing is erased. No copy starts meanwhile. Refused,
 * `answered` hears once when those writes are answered (the last refusal's, if pressed again meanwhile).
 */
export async function eraseAfterWrites<T>(erase: () => Promise<T>, answered?: () => void): Promise<T> {
  erasing = true
  try {
    await answeredInTime(Promise.all(unanswered).then(() => undefined))
    if (stillWriting()) {
      onAnswered = answered ?? null
      throw new ErasureWaits('The browser hasn’t answered a copy')
    }
    return await erase()
  } finally {
    erasing = false
  }
}

/**
 * Copies the text `load` fetches, if the space is still open (`stillOpen`) when it arrives, and still once it is
 * written. A failed fetch says so at once, as itself, not as a blocked clipboard. A write the browser doesn't answer in
 * its wait is CopyUnconfirmed; `landed` hears if it settles later with the space still open.
 */
export async function copyFetched(
  load: () => Promise<string>,
  clip: Clip,
  stillOpen: () => boolean,
  landed: () => void = () => undefined,
): Promise<void> {
  if (!free()) throw new CopyStillWriting('An earlier copy is unanswered, or an erasure is under way')
  const failure: { error?: unknown } = {}
  const text = (async () => {
    const fetched = await load()
    if (!stillOpen()) throw new CopyCalledOff('The personal space locked before the copy')
    return fetched
  })()
  text.catch((err: unknown) => (failure.error = err))
  const written = clip.writeLater ? clip.writeLater(text) : text.then(clip.writeText)
  // Decided as the browser answers, before anything else hears of it: kept, or taken back if the space went meanwhile.
  const now = { late: false, kept: false }
  handedOver(
    written.then(() => {
      now.kept = stillOpen()
      if (!now.kept) return emptied(clip)
      if (now.late) landed()
      return undefined
    }),
  )
  let inTime: boolean
  try {
    inTime = await answeredInTime(written, text)
  } catch (err: unknown) {
    throw failure.error ?? err
  }
  if (!inTime) {
    now.late = true
    throw new CopyUnconfirmed('The browser hasn’t answered the copy')
  }
  if (now.kept) return
  throw new CopyCalledOff('The personal space locked, or its sheet went, while the copy was written')
}

/**
 * A reply's words to the clipboard (Personal's Copy), among the unanswered from the press: true once written in the
 * wait, `late` once its wait is over, then `landed` when it settles. Out of sight once it lands (`shown`), it is taken
 * back. CopyStillWriting while an earlier write is unanswered or an erasure is under way; a refusal is thrown.
 */
export async function copyWords(
  text: string,
  shown: () => boolean,
  late: () => void,
  clip: Clip = browserClip(),
): Promise<void> {
  if (!free()) throw new CopyStillWriting('An earlier copy is unanswered, or an erasure is under way')
  const written = clip.writeText(text)
  handedOver(written.then(() => (shown() ? undefined : emptied(clip))))
  if (await answeredInTime(written)) return
  late()
  await written
}

/** The clipboard emptied, as far as the browser lets a page (a write needs it focused); settled once it answers. */
const emptied = (clip: Clip) => clip.writeText('').catch(() => undefined)

const writeText = (text: string) => navigator.clipboard.writeText(text)

const writeLater = (text: Promise<string>) =>
  navigator.clipboard.write([
    new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) }),
  ])

/** This browser's clipboard: the promise form where ClipboardItem is offered. */
export const browserClip = (): Clip => ('ClipboardItem' in window ? { writeText, writeLater } : { writeText })
