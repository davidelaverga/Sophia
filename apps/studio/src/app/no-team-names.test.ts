import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// What a person reads never names the people who build the Studio (docs/plans/copy-no-team-names.md): a placeholder
// once listed «Davide’s Codex and Claude, Luis’s Claude» to every customer. Read from the strings in the code the Studio
// builds, as TypeScript parses them: never its comments (they are for us); tests and test data aside.
const src = fileURLToPath(new URL('../', import.meta.url))

/** The people who build the Studio, by the names the code has used for them. */
const TEAM = /\b(Davide|Luis)\b/

/** Every source file the Studio builds from: tests and test data excluded. */
function production(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return production(path)
    const built = /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
    return built && entry.name !== 'board-samples.ts' ? [path] : []
  })
}

/** The words a node holds, if it is a string: a literal, a template's part, or JSX text. */
function wordsOf(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateLiteralToken(node)) {
    return node.text
  }
  return ts.isJsxText(node) ? node.text : null
}

/** Every string a source file holds, as TypeScript parses it: never a comment. */
function said(path: string): string[] {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, false, kind)
  const out: string[] = []
  const visit = (node: ts.Node) => {
    const words = wordsOf(node)
    if (words !== null) out.push(words)
    node.forEachChild(visit)
  }
  visit(file)
  return out
}

describe('what a person reads', () => {
  it('names nobody who builds the Studio', () => {
    const naming = production(src).flatMap((path) =>
      said(path)
        .filter((words) => TEAM.test(words))
        .map((words) => `${relative(src, path).split(sep).join('/')}: ${words.trim().slice(0, 80)}`),
    )
    assert.deepEqual(naming, [])
  })
})
