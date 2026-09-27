#!/usr/bin/env node
// openapi/openapi.json = the frozen pack contract (docs/pack/api/openapi.json) + amendments/*.json, in
// file-name order. Every difference from the pack is therefore a reviewed, explained JSON Patch.
//   node scripts/apply-amendments.ts          write openapi/openapi.json
//   node scripts/apply-amendments.ts --check  fail if it does not equal pack + amendments
import { isDeepStrictEqual } from 'node:util'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyPatch, type PatchOp } from '../src/json-patch.ts'

interface Amendment {
  id: string
  goal: string
  title: string
  why: string[]
  patch: PatchOp[]
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACK = join(root, '../../docs/pack/api/openapi.json')
const TARGET = join(root, 'openapi/openapi.json')
const AMENDMENTS = join(root, 'amendments')

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'))

function amendments(): Amendment[] {
  return readdirSync(AMENDMENTS)
    .filter((f) => f.endsWith('.json'))
    .toSorted()
    .map((f) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- reviewed files in this package; applyPatch rejects paths that do not apply
      const a = readJson(join(AMENDMENTS, f)) as Amendment
      if (!f.startsWith(`${a.id}-`)) throw new Error(`${f}: id ${a.id} does not match the file name`)
      return a
    })
}

export function amendedContract(): unknown {
  return amendments().reduce((doc, a) => applyPatch(doc, a.patch), readJson(PACK))
}

if (import.meta.main) {
  const expected = amendedContract()
  if (!process.argv.includes('--check')) {
    writeFileSync(TARGET, `${JSON.stringify(expected, null, 2)}\n`)
    console.log(`wrote ${TARGET}`)
  } else if (isDeepStrictEqual(readJson(TARGET), expected)) {
    console.log('OpenAPI equals the pack plus its amendments')
  } else {
    console.error('openapi/openapi.json differs from pack + amendments; run `pnpm --filter @sophia/contracts generate`')
    process.exit(1)
  }
}
