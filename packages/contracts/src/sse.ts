// Parsing of the Sophia event stream (followProjectEvents), shared by the Studio and tests.
// Browser-safe: no Node imports (published as "@sophia/contracts/sse").
import type { CursorAdvance, Event } from './generated-types.ts'

export type Frame = Event | CursorAdvance

export interface SseParse {
  frames: Frame[]
  /** The SSE `id` of each frame (the decimal project sequence), or null when absent. */
  ids: Array<string | null>
  /** An incomplete trailing block, to prepend to the next chunk. */
  rest: string
}

/** Data lines of one SSE block joined by newlines (the spec's multi-line data), or null. */
function dataOf(block: string): string | null {
  const lines = block.split('\n').filter((l) => l.startsWith('data: '))
  return lines.length > 0 ? lines.map((l) => l.slice('data: '.length)).join('\n') : null
}

/**
 * Split buffered SSE text into complete frames. Comments (`: ping`), `id:` and `retry:` lines carry
 * no frame. The server emits one JSON Event or CursorAdvance per block.
 */
export function parseSse(buffer: string): SseParse {
  const blocks = buffer.split('\n\n')
  const rest = blocks.pop() ?? ''
  const frames: Frame[] = []
  const ids: Array<string | null> = []
  for (const block of blocks) {
    const data = dataOf(block)
    if (data === null) continue
    frames.push(JSON.parse(data) as Frame)
    ids.push(/^id: (.*)$/m.exec(block)?.[1] ?? null)
  }
  return { frames, ids, rest }
}
