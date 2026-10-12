import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const root = new URL('./', import.meta.url)
const read = (name) => readFileSync(new URL(name, root), 'utf8')
const hash = (text) => createHash('sha256').update(text).digest('hex')
const raw = read('representative-traces.safe.txt')
const stages = read('stages.mjs.txt')
const spec = read('trace-spec.ts.txt')
assert.equal(hash(raw), 'a5bfc9b6ab557b86977c106a10d06ba3ce3e853c58fad8db7798af5688192db3')
assert.equal(hash(stages), '5098464e1f2b200764f5e546e093d36355e27a0107be7e9a91b667fde4a5e202')
assert.equal(hash(spec), 'a7b83f91500e4005eb273cb4016a96b1775275acc0aa8c1eb6adfa071bf2b486')
const labels = ['base1', 'base2', 'base7', 'candidate5']
const expected = [
  [4, 33.9, 3, 1, 0, 1.3, 15.1],
  [2, 37.8, 2, 0, 0, 2.3, 10.9],
  [4, 58.3, 2, 2, 0, 2.7, 22.2],
  [4, 48.3, 2, 2, 0, 2, 26.2],
]
const runs = raw.trim().split('\n').map((line) => {
  assert.ok(line.startsWith('CX181 '))
  return JSON.parse(line.slice(6))
})
assert.equal(runs.length, 4)
const round = (n) => Math.round(n * 10) / 10
const observed = runs.map((sample, index) => {
  const markerIndex = sample.rows.findIndex((row) => row.k === 'marker')
  assert.ok(markerIndex >= 0)
  const rows = sample.rows.slice(markerIndex)
  assert.equal(rows.filter((row) => row.k === 'marker').length, 1)
  rows.forEach((row, i) => {
    assert.equal(typeof row.t, 'number')
    if (i) assert.ok(row.t >= rows[i - 1].t)
  })
  const event = (kind) => {
    const matches = rows.filter((row) => row.k === kind)
    assert.equal(matches.length, 1, `${labels[index]} ${kind}`)
    return matches[0]
  }
  const fetch = event('fetch:resolved')
  const body = event('body:read-done')
  const scheduled = event('timer0:scheduled')
  const timer = event('timer0:run')
  const done = event('timer0:done')
  const dom = event('dom')
  assert.equal(fetch.status, 403)
  assert.ok(fetch.t - rows[0].t <= 0.5)
  assert.ok(fetch.t <= body.t && body.t <= scheduled.t && scheduled.t <= timer.t && timer.t <= done.t && done.t <= dom.t)
  assert.equal(scheduled.id, timer.id)
  assert.equal(timer.id, done.id)
  assert.equal(scheduled.query, false)
  assert.equal(dom.context, false)
  assert.equal(dom.fenced, true)
  assert.equal(dom.notShown, true)
  const buckets = [0, 0, 0]
  for (const row of rows) {
    if (row.k !== 'raf' || row.context !== true) continue
    assert.ok(row.t < dom.t)
    buckets[row.t < body.t ? 0 : row.t < timer.t ? 1 : 2] += 1
  }
  assert.equal(buckets.reduce((a, b) => a + b), sample.frames)
  const result = [sample.frames, round(body.t - rows[0].t), ...buckets, round(timer.t - scheduled.t), round(dom.t - done.t)]
  assert.deepEqual(result, expected[index])
  return { label: labels[index], frames: sample.frames, bodyMs: result[1], buckets, timerWaitMs: result[5], timerEndToDomMs: result[6] }
})
const result = {
  verdict: 'REPRESENTATIVE_TRACE_HASH_AND_ARITHMETIC_MATCH',
  source: 'CC0194 four author-published synthetic traces, independently recomputed by Codex',
  observed,
  limits: ['Four selected instrumented traces only; not all30 or original uninstrumented trace data', 'Timer origin and query notification unobserved', 'Observer effect unknown; no privacy or product acceptance clearance', 'No browser, provider, database or native runtime executed by this check'],
}
writeFileSync(new URL('independent-check.safe.json', root), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result))
