/**
 * The native design skill bundle (SDD-01 G1): its manifest is derived from the files under
 * packages/dsh-bundle/skills, never written by hand. Every prompt section, skill and reference is named with its
 * SHA-256 and, where it came from the Raven donor, the donor path and Git blob. The bridge refuses to advertise a
 * design role whose assets do not match this manifest, and tests/unit/design-skills.test.mjs fails when the
 * committed manifest is stale.
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { REPO_ROOT } from './common.mjs'

export const SKILLS_DIR = join(REPO_ROOT, 'packages', 'dsh-bundle', 'skills')
export const MANIFEST = join(SKILLS_DIR, 'manifest.json')
const DONOR = { repository: 'EverMind-AI/Raven', commit: '3632e6040c7038a60ec418ce39ccae185c72c19f', license: 'RAVEN-LICENSE.txt' }
const DONOR_ROOT = 'plugins-dist/design-engine/raven_design/skills'

/** Prompt sections: the pack's runtime candidates, byte for byte. */
const PROMPTS = [
  { id: 'sophia-html-designer', path: 'prompts/HTML_DESIGNER_SYSTEM.v1.md', source: 'docs/missions/2026-10-04-native-design/runtime/HTML_DESIGNER_SYSTEM.v1.md' },
  { id: 'sophia-html-procedure', path: 'prompts/HTML_DESIGN_PROCEDURE.v1.md', source: 'docs/missions/2026-10-04-native-design/runtime/HTML_DESIGN_PROCEDURE.v1.md' },
  { id: 'sophia-visual-reviewer', path: 'prompts/VISUAL_REVIEWER_SYSTEM.v1.md', source: 'docs/missions/2026-10-04-native-design/runtime/VISUAL_REVIEWER_SYSTEM.v1.md' },
]

/** Native skill id → its donor skill directory and reference id prefix. */
const SKILLS = {
  'sophia-visual-foundation-v1': { donor: 'visual-artifact-design', blob: '5f6962e4cf2ed0899dd78a1f89aa2e103c8e7d16', prefix: 'foundation' },
  'sophia-editorial-html-v1': { donor: 'design-editorial-and-presentations', blob: 'b6edaae4f6b49774d53f3e8c25d26d064152f76b', prefix: 'editorial' },
  'sophia-web-finish-v1': { donor: 'build-polished-visual-frontends', blob: '14ff3aeb7b2d888b561e4cb2794c307ec58e7283', prefix: 'web' },
  'sophia-visual-critique-v1': { donor: 'review-against-ai-patterns', blob: 'cf27ed13b88c0082228fc5db11fcce9e5516d64a', prefix: 'critique' },
}

/** Image directories under a skill's references: local dir → reference id segment and donor directory. */
const IMAGE_DIRS = {
  gallery: { segment: 'gallery', donor: 'review-against-ai-patterns/references/anti-slop-gallery' },
  precedents: { segment: 'precedents', donor: 'build-polished-visual-frontends/references/design-precedents' },
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
/** The Git blob id of these bytes, as `git hash-object` computes it. */
const gitBlob = (bytes) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const files = (dir) => readdirSync(dir).sort().map((name) => join(dir, name))

/** A text reference's donor path, read from its front matter `source:` line. */
function donorOf(text) {
  const match = /^source: EverMind-AI\/Raven@[0-9a-f]{40} (\S+)/m.exec(text)
  return match ? match[1] : null
}

function skillEntries(id, spec) {
  const dir = join(SKILLS_DIR, id)
  const skillPath = join(dir, 'SKILL.md')
  const skill = { id, path: relative(SKILLS_DIR, skillPath), sha256: sha256(readFileSync(skillPath)), donor: { path: `${DONOR_ROOT}/${spec.donor}/SKILL.md`, gitBlob: spec.blob } }
  const references = []
  const refDir = join(dir, 'references')
  for (const path of files(refDir)) {
    if (statSync(path).isDirectory()) {
      const images = IMAGE_DIRS[relative(refDir, path)]
      if (!images) throw new Error(`unknown reference directory ${relative(SKILLS_DIR, path)}`)
      for (const image of files(path)) references.push(imageEntry(id, spec, images, image))
      continue
    }
    const bytes = readFileSync(path)
    const text = bytes.toString('utf8')
    const refId = /^id: (\S+)$/m.exec(text)?.[1]
    if (!refId?.startsWith(`${spec.prefix}/`)) throw new Error(`${relative(SKILLS_DIR, path)} has no id under ${spec.prefix}/`)
    references.push({ id: refId, skill: id, kind: 'text', mediaType: 'text/markdown', path: relative(SKILLS_DIR, path), sha256: sha256(bytes), bytes: bytes.length, donor: donorOf(text) })
  }
  return { skill, references }
}

function imageEntry(skillId, spec, images, path) {
  const bytes = readFileSync(path)
  const page = /^page-(\d+)\.jpg$/.exec(relative(join(SKILLS_DIR, skillId, 'references', images.segment), path))
  if (!page) throw new Error(`unexpected reference image ${relative(SKILLS_DIR, path)}`)
  return {
    id: `${spec.prefix}/${images.segment}/page-${page[1].padStart(2, '0')}`,
    skill: skillId,
    kind: 'image',
    mediaType: 'image/jpeg',
    path: relative(SKILLS_DIR, path),
    sha256: sha256(bytes),
    bytes: bytes.length,
    donor: { path: `${DONOR_ROOT}/${images.donor}/page-${page[1]}.jpg`, gitBlob: gitBlob(bytes) },
    rights: 'pending_review',
  }
}

/** @returns {object} the manifest the files on disk imply. */
export function buildSkillsManifest() {
  const promptSections = PROMPTS.map((p) => {
    const bytes = readFileSync(join(SKILLS_DIR, p.path))
    const source = readFileSync(join(REPO_ROOT, p.source))
    if (!bytes.equals(source)) throw new Error(`${p.path} differs from the pack's ${p.source}`)
    return { id: p.id, path: p.path, sha256: sha256(bytes), source: p.source }
  })
  const skills = []
  const references = []
  for (const [id, spec] of Object.entries(SKILLS)) {
    const entries = skillEntries(id, spec)
    skills.push(entries.skill)
    references.push(...entries.references)
  }
  references.sort((a, b) => a.id.localeCompare(b.id))
  return { schema: 'sophia.design-skills.v1', donor: DONOR, notice: 'RAVEN-NOTICE.md', promptSections, skills, references }
}

/** The manifest as committed bytes (two-space JSON and a final newline). */
export const manifestText = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`
