// The Studio's release identity (release-identity.ts, scripts/release-build.mjs; Codex r4233230048): the commit a
// release names, and the check of the page it built, against pages Vite really builds with the Studio's own plugin.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { after, describe, it } from 'node:test'
import { build } from 'vite'
import { buildIdentity } from './build-meta.ts'
import { builtCommits, builtProblem, releaseCommit } from './release-identity.ts'

const COMMIT = '0f4e47d249f8c52f9761efbc6aeae71b073a385e'
const OTHER = '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d'

/** A sophia-build tag as a page carries it. */
const tag = (commit: string) => `<meta name="sophia-build" content="${commit}">`

const scratch = mkdtempSync(join(tmpdir(), 'studio-release-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

/** A page built by Vite with the Studio's identity plugin, VITE_SOPHIA_COMMIT as given (unset when undefined). */
async function builtPage(commit: string | undefined): Promise<string> {
  const root = mkdtempSync(join(scratch, 'page-'))
  writeFileSync(join(root, 'index.html'), '<!doctype html><html><head><title>t</title></head><body></body></html>')
  const before = process.env.VITE_SOPHIA_COMMIT
  if (commit === undefined) delete process.env.VITE_SOPHIA_COMMIT
  else process.env.VITE_SOPHIA_COMMIT = commit
  try {
    await build({
      root,
      configFile: false,
      envDir: root,
      logLevel: 'silent',
      mode: 'production',
      plugins: [buildIdentity()],
      build: { outDir: join(root, 'dist'), emptyOutDir: true },
    })
  } finally {
    if (before === undefined) delete process.env.VITE_SOPHIA_COMMIT
    else process.env.VITE_SOPHIA_COMMIT = before
  }
  return readFileSync(join(root, 'dist', 'index.html'), 'utf8')
}

describe('the Studio’s release build names its commit, and checks the page it built (Codex r4233230048)', () => {
  it('a page built with the commit names it once: the check passes', async () => {
    const html = await builtPage(COMMIT)
    assert.deepEqual(builtCommits(html), [COMMIT])
    assert.equal(builtProblem(html, COMMIT), null)
  })

  it('a page built without the commit names none: the check refuses it', async () => {
    const html = await builtPage(undefined)
    assert.deepEqual(builtCommits(html), [])
    assert.match(builtProblem(html, COMMIT) ?? '', /names no commit/)
  })

  it('a page built at another commit, or with a value that is not one: the check refuses it', async () => {
    assert.match(builtProblem(await builtPage(OTHER), COMMIT) ?? '', new RegExp(`names "${OTHER}"; expected ${COMMIT}`))
    assert.match(builtProblem(await builtPage('main'), COMMIT) ?? '', /names no commit/)
  })

  it('a page that names the commit twice, or names it beside another, is refused', () => {
    assert.match(builtProblem(`<head>${tag(COMMIT)}${tag(COMMIT)}</head>`, COMMIT) ?? '', /names 2 commits/)
    assert.match(builtProblem(`<head>${tag(OTHER)}${tag(COMMIT)}</head>`, COMMIT) ?? '', /names 2 commits/)
  })

  it('the commit is the clean checkout’s HEAD; another asked for, a dirty tree or a HEAD that is not one is refused', () => {
    const clean = { head: COMMIT, dirty: false }
    assert.equal(releaseCommit(clean, [undefined, undefined]), COMMIT)
    assert.equal(releaseCommit(clean, [COMMIT, COMMIT]), COMMIT, 'the same commit asked for again')
    assert.throws(() => releaseCommit(clean, [OTHER, undefined]), /Asked to build "1a2b/)
    assert.throws(
      () => releaseCommit(clean, [undefined, OTHER]),
      /Asked to build "1a2b/,
      'VITE_SOPHIA_COMMIT already set',
    )
    assert.throws(() => releaseCommit(clean, [COMMIT.toUpperCase(), undefined]), /Asked to build/)
    assert.throws(() => releaseCommit({ head: COMMIT, dirty: true }, []), /differs from/)
    assert.throws(() => releaseCommit({ head: 'main', dirty: false }, []), /not a commit/)
  })
})
