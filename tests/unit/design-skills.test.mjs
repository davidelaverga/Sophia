/**
 * SDD-01 G1: the native design skill bundle stays exactly what its manifest, the donor inventory and the parity matrix
 * say. The manifest is derived from the files (scripts/lib/design-skills.mjs); every reference a skill names resolves;
 * every bundled image is the donor's bytes (its Git blob is the inventory's); the prompts are the pack's; and the parity
 * matrix gives every inventoried donor file exactly one disposition.
 */

import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { REPO_ROOT } from '../../scripts/lib/common.mjs'
import { MANIFEST, SKILLS_DIR, buildSkillsManifest, manifestText } from '../../scripts/lib/design-skills.mjs'

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'))
const inventory = JSON.parse(readFileSync(join(REPO_ROOT, 'docs', 'coordination', 'SDD-01', 'raven', 'INVENTORY.json'), 'utf8'))
const parity = readFileSync(join(REPO_ROOT, 'docs', 'coordination', 'SDD-01', 'RAVEN_PARITY.md'), 'utf8')
const ROOT = 'plugins-dist/design-engine/raven_design/skills/'

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name)
  return statSync(path).isDirectory() ? walk(path) : [path]
})

test('the committed manifest is the one the skill files imply', () => {
  assert.equal(readFileSync(MANIFEST, 'utf8'), manifestText(buildSkillsManifest()), 'run node scripts/design-skills.mjs --record and review the diff')
})

test('every file in the skill bundle is named by the manifest (no unlisted asset ships)', () => {
  const listed = new Set([
    'manifest.json', 'RAVEN-LICENSE.txt', 'RAVEN-NOTICE.md',
    ...manifest.promptSections.map((p) => p.path), ...manifest.skills.map((s) => s.path), ...manifest.references.map((r) => r.path),
  ])
  for (const path of walk(SKILLS_DIR)) assert.ok(listed.has(relative(SKILLS_DIR, path)), `${relative(SKILLS_DIR, path)} is not in the manifest`)
})

test('every reference a skill, reference or prompt names resolves in the manifest (dependency closure)', () => {
  const ids = new Set(manifest.references.map((r) => r.id))
  const texts = [...manifest.skills, ...manifest.references.filter((r) => r.kind === 'text'), ...manifest.promptSections]
  let named = 0
  for (const { path } of texts) {
    for (const [, id] of readFileSync(join(SKILLS_DIR, path), 'utf8').matchAll(/`((?:foundation|editorial|web|critique)\/[a-z0-9/-]+)`/g)) {
      named += 1
      assert.ok(ids.has(id), `${path} names ${id}, which is not in the bundle`)
    }
  }
  assert.ok(named >= 13, `only ${named} references named`)
})

test('no skill text names a Raven skill, tool or path the worker cannot reach', () => {
  for (const { path } of [...manifest.skills, ...manifest.references.filter((r) => r.kind === 'text')]) {
    const body = readFileSync(join(SKILLS_DIR, path), 'utf8').replace(/^---[\s\S]*?\n---\n/, '')
    assert.doesNotMatch(body, /\$[a-z]+(-[a-z]+)+/, `${path} names a donor $skill`)
    assert.doesNotMatch(body, /\b(image_generate|web_fetch|read_file|preview_file|visual-web-init|visual-web-info)\b(?![^\n]*(not|no|never|excluded|deferred|instead))/i, `${path} names a donor tool as if available`)
  }
})

test('every bundled image is the donor byte for byte, as the inventory records it', () => {
  const byPath = new Map(inventory.files.map((f) => [f.path, f]))
  const images = manifest.references.filter((r) => r.kind === 'image')
  assert.equal(images.length, 17)
  for (const image of images) {
    const donor = byPath.get(image.donor.path)
    assert.ok(donor, `${image.donor.path} is not in the inventory`)
    assert.deepEqual([image.donor.gitBlob, image.sha256, image.bytes], [donor.git_blob, donor.sha256, donor.bytes], image.id)
    assert.equal(image.rights, 'pending_review', 'rights stay pending until Codex reviews them (binding map O-2)')
  }
})

test('the inventory is the pinned four roots, and the parity matrix disposes of every file exactly once', () => {
  assert.equal(inventory.commit, '3632e6040c7038a60ec418ce39ccae185c72c19f')
  assert.deepEqual(inventory.roots.map((r) => [r.id, r.entry_git_blob]), [
    ['RV-01', '5f6962e4cf2ed0899dd78a1f89aa2e103c8e7d16'],
    ['RV-02', 'b6edaae4f6b49774d53f3e8c25d26d064152f76b'],
    ['RV-03', '14ff3aeb7b2d888b561e4cb2794c307ec58e7283'],
    ['RV-04', 'cf27ed13b88c0082228fc5db11fcce9e5516d64a'],
  ])
  assert.equal(inventory.files.length, 68)
  for (const file of inventory.files) {
    const rows = parity.split('\n').filter((line) => line.startsWith(`| \`${file.path.slice(ROOT.length)}\` |`))
    assert.equal(rows.length, 1, `${file.path} has ${rows.length} rows in the parity matrix`)
    assert.match(rows[0], /\| (preserved|adapted|deferred|excluded) \|/)
    assert.ok(rows[0].includes(file.git_blob.slice(0, 12)) && rows[0].includes(file.sha256.slice(0, 12)), `${file.path} row names other bytes`)
  }
})

test('the prompt sections are the pack runtime candidates byte for byte', () => {
  for (const p of manifest.promptSections) {
    assert.ok(readFileSync(join(SKILLS_DIR, p.path)).equals(readFileSync(join(REPO_ROOT, p.source))), p.id)
  }
})
