/**
 * SDD-01-RF-0001 and RF-0002: what each native design role is told agrees with what it can do. Per role, from the
 * bundle's verified assets (the same loader the bridge uses) and the registry:
 *
 * - Vocabulary (RF-0001): every work-record kind any text names is one `design_record_work` admits, and the tool's kinds
 *   are exactly the database's (0038 constraint, 0039 validation).
 * - Tools: every `design_*` or `review_*` tool a role's installed texts or readable references name is one of its own.
 * - Closure (RF-0002): every reference a role's texts name is inside its reference scope and loads; the scope is
 *   exactly what the registry says, whatever skill holds a reference.
 * - The reviewer loads none of the maker's instructions, and reads the gallery and the precedents its procedure names.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { inReferenceScope, loadDesignAssets } from '../../packages/dsh-bundle/dist/design-assets.js'
import { designTools } from '../../packages/dsh-bundle/dist/design-tools.js'
import { DESIGN_ROLES, roleOf } from '../../packages/dsh-bundle/dist/role-registry.js'
import { REPO_ROOT } from '../../scripts/lib/common.mjs'

const SKILLS = join(REPO_ROOT, 'packages', 'dsh-bundle', 'skills')
const manifest = JSON.parse(readFileSync(join(SKILLS, 'manifest.json'), 'utf8'))
const designer = DESIGN_ROLES.get('sophia-html-designer-v1')
const reviewer = DESIGN_ROLES.get('sophia-visual-review-v1')

/** A text without its front matter (provenance lines, not instructions). */
const body = (text) => text.replace(/^---\n[\s\S]*?\n---\n/, '')
/** The work-record kinds a text names: "kind `risk`" or "(kind risk)". */
const kindsIn = (text) => [...text.matchAll(/\bkind `([a-z_]+)`|\(kind ([a-z_]+)\)/g)].map((m) => m[1] ?? m[2])
const toolsIn = (text) => [...new Set(body(text).match(/\b(?:design|review)_[a-z]+(?:_[a-z]+)*\b/g) ?? [])]
const refsIn = (text) => [...new Set([...body(text).matchAll(/`((?:critique|web|foundation|editorial)\/[a-z0-9/-]+)`/g)].map((m) => m[1]))]

/** Every text in the bundle: prompt sections, skills (and role views), text references. */
const allTexts = () =>
  [...manifest.promptSections, ...manifest.skills, ...manifest.references.filter((r) => r.kind === 'text')].map((f) => ({
    path: f.path,
    text: readFileSync(join(SKILLS, f.path), 'utf8'),
  }))

/** The kinds design_record_work admits, from the tool's own schema. */
function toolKinds() {
  const noop = () => null
  const [tool] = designTools({ client: {}, sessionOf: noop, assetsOf: noop, images: noop, imageRoute: async () => null, log: noop }).filter(
    (t) => t.name === 'design_record_work',
  )
  return tool.parameters.properties.entries.items.properties.kind.enum
}

/** The kinds the database admits: the table's constraint (0038) and the operation's check (0039). */
function sqlKinds() {
  const constraint = /CREATE TABLE sophia\.design_work_entries[\s\S]*?kind text NOT NULL CHECK\(kind IN \(([^)]*)\)\)/.exec(
    readFileSync(join(REPO_ROOT, 'db', 'migrations', '0038_design_records.sql'), 'utf8'),
  )
  const check = /coalesce\(e->>'kind',''\) NOT IN \(([^)]*)\)/.exec(readFileSync(join(REPO_ROOT, 'db', 'migrations', '0039_design_runtime.sql'), 'utf8'))
  const list = (m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
  assert.ok(constraint && check, 'the work-record kinds are found in 0038 and 0039')
  return { constraint: list(constraint), check: list(check) }
}

test('RF-0001: every work-record kind a text names is one the tool and the database admit', () => {
  const kinds = toolKinds()
  const sql = sqlKinds()
  assert.deepEqual(kinds, sql.constraint, 'the tool and the table admit the same kinds')
  assert.deepEqual(kinds, sql.check, 'the tool and the operation admit the same kinds')
  let named = 0
  for (const { path, text } of allTexts()) {
    for (const kind of kindsIn(text)) {
      named += 1
      assert.ok(kinds.includes(kind), `${path} names work-record kind "${kind}", which design_record_work refuses`)
    }
  }
  assert.ok(named >= 5, `only ${named} kinds named`)
  // The check sees the defect it was written for: the imported texts named a kind the API refuses.
  assert.deepEqual(kindsIn('(`design_record_work`, kind `risk_ledger`)').filter((k) => !kinds.includes(k)), ['risk_ledger'])
})

for (const role of [designer, reviewer]) {
  test(`${role.id}: every tool its texts name is its own, and every reference they name is in its scope and loads`, () => {
    const loaded = loadDesignAssets(role)
    assert.equal(loaded.ok, true, loaded.reason)
    const { prompts, references } = loaded.assets
    const own = roleOf(role.id).nativeTools
    const readable = [...references.values()].filter((r) => r.kind === 'text')
    for (const { name, text } of [...prompts.map((p) => ({ name: p.name, text: p.text })), ...readable.map((r) => ({ name: r.id, text: r.text }))]) {
      for (const tool of toolsIn(text)) assert.ok(own.has(tool), `${name} tells ${role.id} to use ${tool}, which it does not have`)
      for (const ref of refsIn(text)) assert.ok(references.has(ref), `${name} names ${ref}, which ${role.id} cannot read`)
    }
    // The scope is exactly the registry's: every reference inside it loads, none outside it does.
    for (const r of manifest.references) assert.equal(references.has(r.id), inReferenceScope(role.references, r.id), `${role.id} and ${r.id}`)
  })
}

test('RF-0002: the reviewer reads the gallery and the precedents, and loads none of the maker\'s instructions', async () => {
  const { assets } = loadDesignAssets(reviewer)
  const images = [...assets.references.values()].filter((r) => r.kind === 'image').map((r) => r.id)
  assert.equal(images.filter((id) => id.startsWith('critique/gallery/')).length, 14)
  assert.deepEqual(images.filter((id) => id.startsWith('web/')), ['web/precedents/page-01', 'web/precedents/page-04', 'web/precedents/page-06'])
  for (const maker of ['critique/ledger-format', 'web/aesthetic-routing', 'web/decision-traces', 'sophia-visual-critique-v1', 'sophia-web-finish-v1']) {
    assert.equal(assets.references.has(maker), false, `the reviewer cannot read ${maker}`)
  }
  const installed = assets.prompts.map((p) => body(p.text)).join('\n')
  assert.doesNotMatch(installed, /\bdesign_[a-z_]+|\bledger\b|stop, restructure/i, 'no maker tool, ledger or stop rule')
  assert.match(installed, /# Visual critique against AI patterns: the independent reviewer/)
  // Through the real tool: a precedent is an image the reviewer receives; a maker text is not in its scope.
  const saved = []
  const noop = () => null
  const tools = designTools({
    client: {},
    sessionOf: () => ({ attemptId: 'a1', nativeSessionId: 's1' }),
    assetsOf: () => assets,
    images: () => ({ saveImage: async (input) => (saved.push(input), { attachmentId: 'att-1', mediaType: input.mediaType, bytes: input.data.byteLength, width: 1, height: 1 }) }),
    imageRoute: async () => null,
    log: noop,
  })
  const read = tools.find((t) => t.name === 'review_read_reference')
  const exec = { callId: 'c1', name: 'review_read_reference', arguments: {}, signal: new AbortController().signal }
  const precedent = await read.execute({ id: 'web/precedents/page-04' }, exec)
  assert.equal(precedent.image?.attachmentId, 'att-1')
  assert.equal(saved.length, 1)
  assert.equal((await read.execute({ id: 'critique/ledger-format' }, exec)).code, 'not_found')
})

test('the designer still reads every reference of its four skills, and the maker\'s critique text has no reviewer clauses', () => {
  const { assets } = loadDesignAssets(designer)
  for (const r of manifest.references) assert.equal(assets.references.has(r.id), true, r.id)
  const critique = assets.prompts.find((p) => p.name === 'sophia-visual-critique-v1').text
  assert.doesNotMatch(critique, /\breview_[a-z_]+|\[C4\.\d\]/, 'the reviewer\'s clauses are its own view, REVIEW.md')
})
