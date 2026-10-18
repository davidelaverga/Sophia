// Downloads that are the version on screen (plan §2.8.5). The viewer saves the bytes it already loaded, after
// SubtleCrypto checks their sha256 against the version record: download = preview, and a mismatch is a visible
// error, never a silent download. The card asks the API for an attachment read and fetches its bytes (a text kept
// inline arrives as text), checks them against the selected version's hash the same way, and saves them as a Blob
// (M03-RF-0012): it never hands the browser a storage URL whose bytes nothing checked. No URL is ever kept.
import type { QueryClient } from '@tanstack/react-query'
import { getSourceContent } from '../../api/artifacts.ts'
import { fencedNow, ownedReportRead, type ReportOwner } from './report-read.ts'

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

/** A report-owned save refused since it began: this person's own newer refusal of the report. Nothing was saved. */
export class SaveWithheld extends Error {
  constructor() {
    super('This report is no longer available to you, so it was not saved.')
  }
}

/**
 * Checked bytes saved for a report's owner as it began (`owner`, captured before any await): after the last await, its
 * report fence is read again with nothing awaited between that read and the save, so a newer own refusal of the report
 * (report-read.ts) stops the save and any success. Without an owner (unowned or local files) it simply saves.
 */
export async function ownedSave(
  file: LoadedBytes,
  sha256: string,
  owner: ReportOwner | undefined,
  save: (blob: Blob, filename: string) => void,
): Promise<void> {
  const blob = await checkedBlob(file.bytes, sha256, file.mime)
  if (owner && fencedNow(owner)) throw new SaveWithheld()
  save(blob, file.filename)
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

/** The bytes behind a short-lived URL, read once and never kept. */
async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!res.ok) throw new Error('The report could not be read. Try again.')
  return new Uint8Array(await res.arrayBuffer())
}

/** What a download reads and saves through; tests pass doubles. */
export interface DownloadDeps {
  getContent: typeof getSourceContent
  fetchBytes: (url: string) => Promise<Uint8Array<ArrayBuffer>>
  save: (blob: Blob, filename: string) => void
}

const browserDeps: DownloadDeps = { getContent: getSourceContent, fetchBytes, save: saveBlob }

/**
 * The typed content API read (GET /api/v1/sources/{id}/content, authorized as the reader): for a source the caller knows
 * is its report's own output, a 401/403/not_found of it is that report's refusal (report-read.ts). The storage URL's
 * bytes, a hash mismatch or any other failure records nothing.
 */
const ownedContent = <T>(owner: ReportOwner | undefined, read: () => Promise<T>): Promise<T> =>
  owner ? ownedReportRead(owner, read) : read()

/**
 * The card's download of one version's file: an attachment read, its bytes (inline text, or fetched from the
 * short-lived URL), checked against `expectedSha256` (the selected version's record), then saved as a Blob. A
 * mismatch, a record for other bytes or a failed read is an error the card shows; nothing is saved unchecked.
 * Resolves with the filename and size it saved.
 */
export async function downloadSource(
  token: string,
  sourceId: string,
  expectedSha256: string,
  deps: DownloadDeps = browserDeps,
  owner?: ReportOwner,
): Promise<{ filename: string; byteLength: number }> {
  // The report and the account's cache as the download began, never looked up again after an await.
  const began = owner && { client: owner.client, artifactId: owner.artifactId }
  const content = await ownedContent(began, () => deps.getContent(token, sourceId, 'attachment'))
  if (content.sha256.toLowerCase() !== expectedSha256.toLowerCase()) throw new HashMismatch()
  let bytes: Uint8Array<ArrayBuffer>
  if (content.text !== undefined) bytes = utf8(content.text)
  else if (content.downloadUrl) bytes = await deps.fetchBytes(content.downloadUrl)
  else throw new Error('This file is not available to download yet.')
  await ownedSave({ bytes, filename: content.filename, mime: content.mime }, expectedSha256, began, deps.save)
  return { filename: content.filename, byteLength: bytes.byteLength }
}

export interface LoadedBytes {
  bytes: Uint8Array<ArrayBuffer>
  filename: string
  mime: string
}

/**
 * A stored file's bytes for the viewer (a report's PDF), checked against its sha256 before anything is shown, so the
 * page on screen is the file that downloads.
 */
export async function loadReportBytes(
  token: string,
  sourceId: string,
  sha256: string,
  owner?: ReportOwner,
): Promise<LoadedBytes> {
  const content = await ownedContent(owner, () => getSourceContent(token, sourceId, 'inline'))
  if (content.sha256.toLowerCase() !== sha256.toLowerCase()) throw new HashMismatch()
  let bytes: Uint8Array<ArrayBuffer>
  if (content.text !== undefined) bytes = utf8(content.text)
  else if (content.downloadUrl) bytes = await fetchBytes(content.downloadUrl)
  else throw new Error('This file is not available yet.')
  if ((await sha256Hex(bytes)) !== sha256.toLowerCase()) throw new HashMismatch()
  return { bytes, filename: content.filename, mime: content.mime }
}

export interface LoadedText {
  text: string
  filename: string
  mime: string
  byteLength: number
}

/**
 * A report version's text for the viewer, checked against the version's sha256 before anything is shown: the
 * preview is the download. A text kept inline arrives as text; one in the byte store, from its URL, as bytes.
 */
export async function loadReportText(
  token: string,
  sourceId: string,
  sha256: string,
  owner?: ReportOwner,
): Promise<LoadedText> {
  const content = await ownedContent(owner, () => getSourceContent(token, sourceId, 'inline'))
  let bytes: Uint8Array<ArrayBuffer>
  if (content.text !== undefined) bytes = utf8(content.text)
  else if (content.downloadUrl) bytes = await fetchBytes(content.downloadUrl)
  else throw new Error('This report is not available yet.')
  if ((await sha256Hex(bytes)) !== sha256.toLowerCase()) throw new HashMismatch()
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
  return { text, filename: content.filename, mime: content.mime, byteLength: bytes.byteLength }
}

/** The query function of a report's own text: its content API read is that report's own (`ownedContent`). */
export const ownedText =
  (token: string, sourceId: string, sha256: string, artifactId: string) =>
  ({ client }: { client: QueryClient }): Promise<LoadedText> =>
    loadReportText(token, sourceId, sha256, { client, artifactId })

/** The query function of a report's own rendition bytes, likewise. */
export const ownedBytes =
  (token: string, sourceId: string, sha256: string, artifactId: string) =>
  ({ client }: { client: QueryClient }): Promise<LoadedBytes> =>
    loadReportBytes(token, sourceId, sha256, { client, artifactId })
