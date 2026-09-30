/**
 * Read a dsh session log from a Harness home, as the installed unit wrote it.
 * dsh 0.1.7 and 0.2.0 both keep one `session.v4.jsonl.zstd` per session under
 * `$DSH_HOME/sessions/<workspace key>/<session id>/` (SESSION_FORMAT_VERSION 4).
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { constants, zstdDecompressSync } from 'node:zlib'

/** Zstandard frame magic (0xFD2FB528, little-endian). */
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/**
 * Decode dsh's container of concatenated Zstandard frames. Node's one-shot
 * decoder stops after the first frame, so the container is split at frame
 * magic and each candidate range must decode on its own (frames carry a
 * checksum, so a magic sequence inside a block cannot pass as a boundary). A
 * final frame still being written decodes as far as it was flushed.
 */
export function decodeFrames(buffer) {
  const starts = []
  for (let at = buffer.indexOf(MAGIC); at !== -1; at = buffer.indexOf(MAGIC, at + 1)) starts.push(at)
  if (starts[0] !== 0) throw new Error('not a Zstandard container')
  const parts = []
  let start = 0
  for (let i = 1; i <= starts.length; i += 1) {
    const end = i < starts.length ? starts[i] : buffer.length
    try {
      parts.push(zstdDecompressSync(buffer.subarray(start, end)))
      start = end
    } catch (error) {
      if (i < starts.length) continue
      parts.push(zstdDecompressSync(buffer.subarray(start), { finishFlush: constants.ZSTD_e_flush }))
    }
  }
  return Buffer.concat(parts)
}

/** @returns {string | null} the session log file of `sessionId`, or null when there is none. */
export function sessionLogFile(dshHome, sessionId) {
  const root = join(dshHome, 'sessions')
  if (!existsSync(root)) return null
  for (const workspace of readdirSync(root)) {
    const file = join(root, workspace, sessionId, 'session.v4.jsonl.zstd')
    if (existsSync(file)) return file
  }
  return null
}

/** @returns {any[]} the session's events in log order. */
export function sessionEvents(dshHome, sessionId) {
  const file = sessionLogFile(dshHome, sessionId)
  if (!file) throw new Error(`no session log for ${sessionId} under ${dshHome}`)
  return decodeFrames(readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
}
