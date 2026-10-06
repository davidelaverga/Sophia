// The renderer's entry points (M03-RF-0023): importing the package's public entry, or any module it exports from,
// never depends on what the importing process was started with: a first argument that is no path (a URL, a missing
// file) is not the module. The supervisor still runs when it is the command, named directly or through its bin link
// (the kernel's own run is in render-html.test.ts).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = (file: string) => fileURLToPath(new URL(`../${file}`, import.meta.url))
const ENTRIES = ['index.mjs', 'render-html.mjs', 'capture-html.mjs', 'supervisor.mjs', 'host-probe.mjs']
/** No supervisor setting reaches the commands run here: each refuses to start, and says what it needs. */
const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? '' }

const node = (args: string[]) => spawnSync(process.execPath, args, { env, encoding: 'utf8', timeout: 60_000 })

describe('the renderer’s entry points', () => {
  for (const entry of ENTRIES) {
    for (const first of ['file:///not/a/path', path.join(os.tmpdir(), 'sophia-no-such-file')]) {
      it(`imports ${entry} whatever the first argument (${first.startsWith('file:') ? 'a URL' : 'a missing file'})`, () => {
        const run = node(['--input-type=module', '-e', `await import(${JSON.stringify(here(entry))})`, '--', first])
        assert.equal(run.status, 0, run.stderr)
        assert.equal(run.stdout, '')
      })
    }
  }

  it('runs the supervisor when it is the command, named directly or through a link (the package’s bin)', () => {
    const direct = node([here('supervisor.mjs')])
    assert.notEqual(direct.status, 0)
    assert.match(direct.stderr, /set SOPHIA_API_URL/)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sophia-supervisor-bin-'))
    try {
      const bin = path.join(dir, 'sophia-render-supervisor')
      fs.symlinkSync(here('supervisor.mjs'), bin)
      const linked = node([bin])
      assert.notEqual(linked.status, 0)
      assert.match(linked.stderr, /set SOPHIA_API_URL/)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
