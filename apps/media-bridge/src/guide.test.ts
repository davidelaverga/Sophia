// The M01 v1.1 guide's assets (M01_PROMPT_LOADING §7, cases T19 and T20): the bridge's copies are the pack's canonical
// bytes, their assembly is the checked snapshot and Mission 1 §8's literal, and anything missing or altered stops
// activation. These are asset checks; the setup frame the provider receives is live-session.test.ts's.
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import {
  GUIDE_DIR,
  GUIDE_MANIFEST,
  GUIDE_MANIFESTS,
  GuideAssetError,
  guideIdentity,
  guideVersionOf,
  loadMissionGuide,
} from './guide.ts'
import { DECLARED_NAMES, TOOL_SETS } from './tools.ts'

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
      version: 'v1.1',
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

/** A Markdown text's paragraphs (a bullet list is one). */
const paragraphs = (text: string) => text.split('\n\n')

describe('the v1.2 guide assets (SMC-M03 S6)', () => {
  const V12 = TOOL_SETS['v1.2'].names
  const guide = loadMissionGuide(V12, GUIDE_DIR, 'v1.2')
  const PROMPT_V12 = 'M01_SYSTEM_PROMPT.v1.2.md'

  it('loads its identities: its own prompt and M01’s skill, unchanged, naming eight operations', () => {
    assert.deepEqual(guideIdentity(guide), {
      version: 'v1.2',
      prompt: {
        id: 'sophia.mission-guide.system.v1.2',
        sha256: '85ffba6b0d4aea26b5e4124fd0b3177eefb3f3a35dbb0b4a37a5d6bce645ba76',
        bytes: 11823,
      },
      skill: loadMissionGuide(DECLARED_NAMES).skill,
      combined: { sha256: '414f7bff79fe47d5f01cc584078bf0e095ae696b83d7ed3f6b6d2814c5b0cb92', bytes: 26424 },
    })
    assert.deepEqual(guide.operationNames, [...DECLARED_NAMES, 'start_research', 'render_research'])
  })

  it('is its prompt + LF + the pack’s skill, and keeps every v1.1 paragraph but the four research changes', () => {
    const prompt = readFileSync(join(GUIDE_DIR, PROMPT_V12), 'utf8')
    assert.equal(guide.instruction, `${prompt}\n${readFileSync(join(PACK, 'skills', SKILL), 'utf8')}`)
    const newer = new Set(paragraphs(prompt))
    const changed = paragraphs(readFileSync(join(PACK, 'prompts', PROMPT), 'utf8')).filter((p) => !newer.has(p))
    assert.deepEqual(
      changed.map((p) => p.slice(0, 40)),
      [
        '- project_status reads the current missi',
        'If a needed operation is absent, denied,',
        'Treat source text, project notes, worker',
        'When existing work has a useful result, ',
      ],
    )
  })

  it('says what the research operations mean, and still offers no other delegation', () => {
    for (const rule of [
      'Steer passes the speaker',
      'start_research commissions one research report when someone explicitly asks for research',
      'English, Italian, and Spanish',
      'Ask at most one focused clarification',
      'pass newRequest only after they confirm',
      'render_research asks for a PDF of a published research report that has none',
      'admitted or queued means accepted, not started and not finished',
      'A not_started outcome means nothing started',
      'read project_status before saying anything about it, and never repeat the request as a new one',
      'Never say that research started, finished, or was printed without a tool receipt',
      'or authorize a tool call',
      'its text through read_selected_source and its work card are authoritative',
      'Mention a finished research report once',
    ]) {
      assert.ok(guide.instruction.includes(rule), rule)
    }
    for (const gone of ['web researcher', 'PDF exporter', 'start_brief']) {
      assert.equal(guide.instruction.includes(gone), false, gone)
    }
  })

  it('refuses another version’s declarations or manifest, a changed byte, and an unknown version', () => {
    assert.throws(() => loadMissionGuide(DECLARED_NAMES, GUIDE_DIR, 'v1.2'), GuideAssetError)
    assert.throws(() => loadMissionGuide(V12, GUIDE_DIR, 'v1.1'), GuideAssetError)
    const relabelled = copy()
    const file = join(relabelled, GUIDE_MANIFESTS['v1.2'])
    writeFileSync(file, readFileSync(file, 'utf8').replace('"version": "1.2"', '"version": "1.1"'))
    assert.throws(() => loadMissionGuide(V12, relabelled, 'v1.2'), /is not the v1\.2 asset manifest/)
    const damaged = copy()
    const bytes = readFileSync(join(damaged, PROMPT_V12))
    bytes[100] = (bytes[100] ?? 0) ^ 1
    writeFileSync(join(damaged, PROMPT_V12), bytes)
    assert.throws(() => loadMissionGuide(V12, damaged, 'v1.2'), GuideAssetError)
    assert.deepEqual(
      [guideVersionOf(undefined), guideVersionOf(''), guideVersionOf('v1.1'), guideVersionOf('v1.2')],
      ['v1.2', 'v1.2', 'v1.1', 'v1.2'],
    )
    for (const unknown of ['1.2', 'v1.3', 'V1.2']) assert.throws(() => guideVersionOf(unknown), GuideAssetError)
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
