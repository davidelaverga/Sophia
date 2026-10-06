// A unified diff between two texts, by lines (SDD-01: "complete diff" of a revision). The common head and tail are
// trimmed first; the middle is matched by a longest-common-subsequence table when it is small enough, else shown as one
// replacement. The result is bounded, and says when it was cut.

/** The most changed lines the LCS table is built for (on each side). */
const LCS_LINES = 2000
/** The most characters a diff returns. */
export const DIFF_CHARS = 65_536

type Op = { kind: ' ' | '-' | '+'; line: string }

/** `table[i][j]`: the longest common subsequence of `a[i..]` and `b[j..]`, flattened. */
function lcsTable(a: readonly string[], b: readonly string[]): Uint32Array {
  const width = b.length + 1
  const table = new Uint32Array((a.length + 1) * width)
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const at = i * width + j
      table[at] =
        a[i] === b[j] ? (table[at + width + 1] ?? 0) + 1 : Math.max(table[at + width] ?? 0, table[at + 1] ?? 0)
    }
  }
  return table
}

function lcsOps(a: readonly string[], b: readonly string[]): Op[] {
  const table = lcsTable(a, b)
  const width = b.length + 1
  const score = (i: number, j: number): number => table[i * width + j] ?? 0
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    const kind = nextKind(a, b, i, j, score)
    ops.push({ kind, line: (kind === '+' ? b[j] : a[i]) ?? '' })
    if (kind !== '+') i += 1
    if (kind !== '-') j += 1
  }
  return ops
}

function nextKind(
  a: readonly string[],
  b: readonly string[],
  i: number,
  j: number,
  score: (i: number, j: number) => number,
): Op['kind'] {
  if (i < a.length && j < b.length && a[i] === b[j]) return ' '
  if (j < b.length && (i >= a.length || score(i, j + 1) >= score(i + 1, j))) return '+'
  return '-'
}

function middleOps(a: readonly string[], b: readonly string[]): Op[] {
  if (a.length <= LCS_LINES && b.length <= LCS_LINES) return lcsOps(a, b)
  return [...a.map((line): Op => ({ kind: '-', line })), ...b.map((line): Op => ({ kind: '+', line }))]
}

/** `--- a/<path>` / `+++ b/<path>` and one hunk over the changed middle, with up to three lines of context. */
export function unifiedDiff(path: string, before: string, after: string): string {
  if (before === after) return ''
  const a = before.split('\n')
  const b = after.split('\n')
  let head = 0
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1
  let tail = 0
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail])
    tail += 1
  const context = 3
  const from = Math.max(0, head - context)
  const toA = Math.min(a.length, a.length - tail + context)
  const toB = Math.min(b.length, b.length - tail + context)
  const ops: Op[] = [
    ...a.slice(from, head).map((line): Op => ({ kind: ' ', line })),
    ...middleOps(a.slice(head, a.length - tail), b.slice(head, b.length - tail)),
    ...a.slice(a.length - tail, toA).map((line): Op => ({ kind: ' ', line })),
  ]
  const header = `--- a/${path}\n+++ b/${path}\n@@ -${from + 1},${toA - from} +${from + 1},${toB - from} @@\n`
  const body = ops.map((op) => `${op.kind}${op.line}`).join('\n')
  const text = `${header}${body}\n`
  return text.length <= DIFF_CHARS ? text : `${text.slice(0, DIFF_CHARS)}\n… (diff cut at ${DIFF_CHARS} characters)\n`
}
