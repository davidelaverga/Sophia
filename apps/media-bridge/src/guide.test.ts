// The M01 v1.1 guide's assets (M01_PROMPT_LOADING §7, cases T19 and T20): the bridge's copies are the pack's canonical
// bytes, their assembly is the checked snapshot and Mission 1 §8's literal, and anything missing or altered stops
// activation. These are asset checks; the setup frame the provider receives is live-session.test.ts's.
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { GUIDE_DIR, GUIDE_MANIFEST, GuideAssetError, guideIdentity, loadMissionGuide } from './guide.ts'
import { DECLARED_NAMES } from './tools.ts'

const PACK = fileURLToPath(new URL('../../../docs/missions/2026-09-27-companion-research/', import.meta.url))
const PROMPT = 'M01_SYSTEM_PROMPT.v1.1.md'
const SKILL = 'mission-lifecycle.v1.1.md'
const SNAPSHOT = 'M01_SYSTEM_INSTRUCTION.v1.1.txt'

const scratch = mkdtempSync(join(tmpdir(), 'sophia-guide-'))
after(() => rmSync(scratch, { recursive: true, force: true }))
let copies = 0
/** A copy of the assets to damage. */
function copy(): string {
  const dir = join(scratch, `guide-${String(copies++)}`)
  cpSync(GUIDE_DIR, dir, { recursive: true })
  return dir
}
const refuses = (dir: string, declared: readonly string[] = DECLARED_NAMES) =>
  assert.throws(() => loadMissionGuide(declared, dir), GuideAssetError)

describe('the M01 v1.1 guide assets (T19)', () => {
  const guide = loadMissionGuide(DECLARED_NAMES)

  it('loads the manifest’s identities: prompt, skill and combined instruction', () => {
    assert.deepEqual(guideIdentity(guide), {
      prompt: {
        id: 'sophia.mission-guide.system.v1.1',
        sha256: 'e4fb14d37cab837023fbf1cd5ac567c4c4715ba35c7b6ba8965ea25c93d6c44b',
        bytes: 9809,
      },
      skill: {
        id: 'sophia.team-mission-lifecycle.v1.1',
        sha256: '2e746dfb9f7c7a3ad2b77ce2b95093d7a9421630e68b343edced582ea44090d5',
        bytes: 14600,
      },
      combined: { sha256: '7fe8f7291389574d50f075742b226fbbef5fe6f6bed50299cfa573f7fe7a8f6d', bytes: 24410 },
    })
    assert.deepEqual(guide.operationNames, DECLARED_NAMES)
  })

  it('is the pack’s canonical bytes, assembled as prompt + LF + skill, and Mission 1 §8’s literal', () => {
    for (const [name, packPath] of [
      [PROMPT, `prompts/${PROMPT}`],
      [SKILL, `skills/${SKILL}`],
      [SNAPSHOT, `prompts/${SNAPSHOT}`],
      [GUIDE_MANIFEST, `prompts/${GUIDE_MANIFEST}`],
    ] as const) {
      assert.ok(readFileSync(join(GUIDE_DIR, name)).equals(readFileSync(join(PACK, packPath))), name)
    }
    const prompt = readFileSync(join(PACK, 'prompts', PROMPT), 'utf8')
    const skill = readFileSync(join(PACK, 'skills', SKILL), 'utf8')
    assert.equal(guide.instruction, `${prompt}\n${skill}`)
    const spec = readFileSync(join(PACK, 'missions/M01_MISSION_COMPANION.md'), 'utf8')
    const literal =
      /<!-- M01_FULL_SYSTEM_INSTRUCTION_BEGIN -->\n```text\n([\s\S]*?)```\n<!-- M01_FULL_SYSTEM_INSTRUCTION_END -->/.exec(
        spec,
      )?.[1]
    assert.equal(literal, guide.instruction)
  })

  it('holds one complete core and one complete skill, with no older candidate and no brief prompt', () => {
    const count = (text: string) => guide.instruction.split(text).length - 1
    assert.equal(count('# Sophia — Mission companion'), 1)
    assert.equal(count("# Mission-lifecycle skill — Guide the team's evolving mission"), 1)
    const modes = [...guide.instruction.matchAll(/^## [1-6]\. ([A-Z]+) /gm)].map((m) => m[1])
    assert.deepEqual(modes, ['WANTING', 'PREDICTING', 'EXPECTING', 'EXPLAINING', 'ESCAPING', 'ABSTRACTING'])
    for (const retired of ['start_brief', 'Start a brief', 'restored without the earlier conversation']) {
      assert.equal(guide.instruction.includes(retired), false, retired)
    }
    // The v1 candidates' own markers: the skill's front matter status and the core's heading.
    for (const [file, marker] of [
      ['skills/mission-lifecycle.v1.md', 'status: candidate_skill_to_bind_and_test_in_M01'],
      ['skills/guide-system-core.v1.md', '# Candidate shared guide policy'],
    ] as const) {
      assert.ok(readFileSync(join(PACK, file), 'utf8').includes(marker), `${file} still carries its marker`)
      assert.equal(guide.instruction.includes(marker), false, `${file} is not loaded`)
    }
  })
})

describe('a guide that cannot be activated (T20)', () => {
  it('a missing asset stops it', () => {
    for (const name of [PROMPT, SKILL, SNAPSHOT, GUIDE_MANIFEST]) {
      const dir = copy()
      unlinkSync(join(dir, name))
      refuses(dir)
    }
  })

  it('one changed byte in the prompt, the skill or the snapshot stops it', () => {
    for (const name of [PROMPT, SKILL, SNAPSHOT]) {
      const dir = copy()
      const bytes = readFileSync(join(dir, name))
      bytes[100] = (bytes[100] ?? 0) ^ 1
      writeFileSync(join(dir, name), bytes)
      refuses(dir)
    }
  })

  it('a BOM, CRLF line endings or a trailing blank line stops it, even with a manifest rewritten to match', () => {
    const variants: Array<(text: string) => string> = [
      (t) => `﻿${t}`,
      (t) => t.replaceAll('\n', '\r\n'),
      (t) => `${t}\n`,
    ]
    for (const variant of variants) {
      const dir = copy()
      writeFileSync(join(dir, PROMPT), variant(readFileSync(join(dir, PROMPT), 'utf8')))
      refuses(dir)
    }
  })

  it('an altered manifest stops it: another hash, another assembly rule, or other operations', () => {
    const edits: Array<(m: Record<string, unknown>) => void> = [
      (m) => {
        m.assembled = { path: `prompts/${SNAPSHOT}`, sha256: '0'.repeat(64), bytes: 24410 }
      },
      (m) => {
        m.assembly = { ...(m.assembly as object), summarization: true }
      },
      (m) => {
        m.model_facing_operation_names = [...DECLARED_NAMES, 'start_brief']
      },
    ]
    for (const edit of edits) {
      const dir = copy()
      const manifest = JSON.parse(readFileSync(join(dir, GUIDE_MANIFEST), 'utf8')) as Record<string, unknown>
      edit(manifest)
      writeFileSync(join(dir, GUIDE_MANIFEST), JSON.stringify(manifest))
      refuses(dir)
    }
  })

  it('declarations that differ from the operations the guide names stop it', () => {
    refuses(GUIDE_DIR, [...DECLARED_NAMES, 'start_brief'])
    refuses(
      GUIDE_DIR,
      DECLARED_NAMES.filter((n) => n !== 'decide_mission_change'),
    )
    refuses(GUIDE_DIR, DECLARED_NAMES.toReversed())
  })

  it('names the file and the check, never the content', () => {
    const dir = copy()
    unlinkSync(join(dir, SKILL))
    assert.throws(
      () => loadMissionGuide(DECLARED_NAMES, dir),
      /mission guide not activated: mission-lifecycle\.v1\.1\.md is missing/,
    )
  })
})
