import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { readBoardView } from './board-view.ts'

// The packet's own synthetic examples, installed byte for byte (docs/missions/2026-10-03-workboard-connection).
const examples = new URL('../../../../../../docs/missions/2026-10-03-workboard-connection/examples/', import.meta.url)
const example = (name: string): unknown => JSON.parse(readFileSync(new URL(name, examples), 'utf8'))

type Path = readonly (string | number)[]
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** A deep copy of a JSON value with the value at `path` replaced, or removed (`undefined`): a negative case. */
function edited(value: unknown, path: Path, to: unknown): unknown {
  const copy: unknown = structuredClone(value)
  let at: unknown = copy
  for (const key of path.slice(0, -1)) at = isObject(at) ? at[key] : undefined
  const last = path.at(-1)
  if (!isObject(at) || last === undefined) throw new Error(`no ${path.join('.')} to change`)
  if (to === undefined) delete at[last]
  else at[last] = to
  return copy
}

describe('readBoardView', () => {
  it('accepts the packet’s review-ready board as given', () => {
    const read = readBoardView(example('board-review-ready.json'))
    assert.equal(read.ok, true, read.ok ? '' : read.problems.join('\n'))
  })

  it('refuses each of the packet’s negative boards, saying why', () => {
    const board = example('board-review-ready.json')
    const item = ['goals', 0, 'items', 0]
    const plan = ['goals', 0, 'current_plan']
    const cases: [string, Path, unknown, RegExp][] = [
      ['complete without its policy', [...item, 'lifecycle'], 'complete', /complete only with/],
      ['accepted without its decision', [...plan, 'decision_ref'], null, /names its decision/],
      [
        'a candidate trigger without its producer',
        [...plan, 'items', 0, 'activation'],
        { kind: 'candidate_ready', producer_work_id: null },
        /names its producer/,
      ],
    ]
    for (const [name, path, to, says] of cases) {
      const read = readBoardView(edited(board, path, to))
      assert.equal(read.ok, false, name)
      if (!read.ok) assert.match(read.problems.join('\n'), says, name)
    }
  })

  it('refuses a shape that isn’t the board’s: a missing field, an unknown one, a wrong value', () => {
    const board = example('board-review-ready.json')
    const item = ['goals', 0, 'items', 0]
    const missing = readBoardView(edited(board, [...item, 'assignment'], undefined))
    const extra = readBoardView(edited(board, [...item, 'owner_ok'], true))
    const wrong = readBoardView(edited(board, [...item, 'lifecycle'], 'done'))
    const hash = readBoardView(edited(board, [...item, 'candidates', 0, 'sha256'], 'AAAA'))
    const v1 = readBoardView(edited(board, ['goals', 0, 'current_plan', 'schema_version'], 'sophia.work.plan.v1'))
    for (const [read, says] of [
      [missing, /items\[0\]\.assignment: missing/],
      [extra, /owner_ok: not in the shape/],
      [wrong, /lifecycle: one of/],
      [hash, /sha256: a lowercase sha256/],
      [v1, /schema_version: one of sophia\.work\.plan\.v2/],
    ] as const) {
      assert.equal(read.ok, false)
      if (!read.ok) assert.match(read.problems.join('\n'), says)
    }
    assert.equal(readBoardView(null).ok, false)
    assert.equal(readBoardView([]).ok, false)
  })
})
