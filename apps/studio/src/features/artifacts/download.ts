// Downloads that are the version on screen (plan §2.8.5). The viewer saves the bytes it already loaded, after
// SubtleCrypto checks their sha256 against the version record: download = preview, and a mismatch is a visible
// error, never a silent download. The card asks the API for an attachment read and goes to its short-lived URL; a
// text kept inline comes back as text and is checked the same way. No URL is ever kept.
import { getSourceContent } from '../../api/artifacts.ts'

export class HashMismatch extends Error {
  constructor() {
    super('The file did not match its record, so it was not saved. Try again.')
  }
}

/** The lowercase hex sha256 of some bytes. */
export async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** The bytes of a text as stored (UTF-8). */
export const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text)

/** A Blob of `bytes` when their hash is `expected`; otherwise HashMismatch. */
export async function checkedBlob(bytes: Uint8Array<ArrayBuffer>, expected: string, mime: string): Promise<Blob> {
  if ((await sha256Hex(bytes)) !== expected.toLowerCase()) throw new HashMismatch()
  return new Blob([bytes], { type: mime })
}

/** Save a Blob under `filename` through a same-origin object URL, so the name holds. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  // The click has started the save; the URL can go once the browser has read it.
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** The card's download: an attachment read, then its bytes. Resolves with the filename and size it saved. */
export async function downloadSource(
  token: string,
  sourceId: string,
): Promise<{ filename: string; byteLength: number }> {
  const content = await getSourceContent(token, sourceId, 'attachment')
  if (content.text !== undefined) {
    saveBlob(await checkedBlob(utf8(content.text), content.sha256, content.mime), content.filename)
  } else if (content.downloadUrl) {
    // An attachment does not unload the page: the same tab goes to it and stays.
    window.location.assign(content.downloadUrl)
  } else {
    throw new Error('This file is not available to download yet.')
  }
  return { filename: content.filename, byteLength: content.byteLength }
}

export interface LoadedText {
  text: string
  filename: string
  mime: string
  byteLength: number
}

/** The bytes behind a short-lived URL, read once and never kept. */
async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!res.ok) throw new Error('The report could not be read. Try again.')
  return new Uint8Array(await res.arrayBuffer())
}

/**
 * A report version's text for the viewer, checked against the version's sha256 before anything is shown: the
 * preview is the download. A text kept inline arrives as text; one in the byte store, from its URL, as bytes.
 */
export async function loadReportText(token: string, sourceId: string, sha256: string): Promise<LoadedText> {
  const content = await getSourceContent(token, sourceId, 'inline')
  let bytes: Uint8Array<ArrayBuffer>
  if (content.text !== undefined) bytes = utf8(content.text)
  else if (content.downloadUrl) bytes = await fetchBytes(content.downloadUrl)
  else throw new Error('This report is not available yet.')
  if ((await sha256Hex(bytes)) !== sha256.toLowerCase()) throw new HashMismatch()
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
  return { text, filename: content.filename, mime: content.mime, byteLength: bytes.byteLength }
}
