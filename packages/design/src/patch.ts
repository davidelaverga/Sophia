// Scoped edits to a source package (SDD-01, pack 05 §6, B-16..B-18). An edit replaces one exact, unique piece of text:
// text that is absent or appears twice is refused, never guessed. Whether the result stays in scope is decided by the
// sections, not by the edits: every section outside the admitted ones keeps its exact bytes, and the page around the
// sections and the stylesheet change only when the scope says so. The diff is computed from the files themselves.

import { parseDocument } from './dom.ts'
import { error, type Finding } from './findings.ts'
import { fileOf, sectionsOf, shellOf, SOURCE_PATHS, type Section, type SourceFile, type SourcePath } from './package.ts'

export interface Edit {
  readonly path: SourcePath
  readonly find: string
  readonly replace: string
}

/** What an edit may change. An empty `sections` with `shell` and `styles` false changes nothing. */
export interface EditScope {
  readonly sections: readonly string[]
  /** `index.html` outside every section: head, header, navigation, footer, adding or removing sections. */
  readonly shell: boolean
  readonly styles: boolean
}

export const FULL_SCOPE: EditScope = { sections: ['*'], shell: true, styles: true }

export type EditOutcome =
  { readonly ok: true; readonly files: SourceFile[] } | { readonly ok: false; readonly findings: Finding[] }

function occurrences(text: string, find: string): number {
  let n = 0
  for (let at = text.indexOf(find); at !== -1 && n < 2; at = text.indexOf(find, at + 1)) n += 1
  return n
}

/** Apply edits in order, each to the text the previous ones left. */
export function applyEdits(files: readonly SourceFile[], edits: readonly Edit[]): EditOutcome {
  const texts = new Map<SourcePath, string>(files.map((f) => [f.path, f.text]))
  for (const [i, edit] of edits.entries()) {
    const at = `edit ${i + 1}`
    if (!(SOURCE_PATHS as readonly string[]).includes(edit.path))
      return refuse('edit_bad_path', edit.path, `${at} names ${edit.path}, not a source file`)
    const text = texts.get(edit.path)
    if (text === undefined) {
      if (edit.find !== '')
        return refuse('edit_not_found', edit.path, `${at}: ${edit.path} does not exist; create it with an empty find`)
      texts.set(edit.path, edit.replace)
      continue
    }
    if (edit.find === '')
      return refuse('edit_not_found', edit.path, `${at}: an empty find only creates a file that does not exist`)
    const n = occurrences(text, edit.find)
    if (n === 0)
      return refuse(
        'edit_not_found',
        edit.path,
        `${at}: the text to replace is not in ${edit.path} (it may have changed)`,
      )
    if (n > 1)
      return refuse(
        'edit_ambiguous',
        edit.path,
        `${at}: the text to replace appears more than once in ${edit.path}; include more context`,
      )
    texts.set(
      edit.path,
      text.replace(edit.find, () => edit.replace),
    )
  }
  return {
    ok: true,
    files: SOURCE_PATHS.flatMap((path) => (texts.has(path) ? [{ path, text: texts.get(path) ?? '' }] : [])),
  }
}

const refuse = (code: string, path: string, message: string): EditOutcome => ({
  ok: false,
  findings: [error(code, path, message)],
})

/** Protected sections that were removed or changed. */
function sectionScopeFindings(s0: readonly Section[], s1: readonly Section[], scope: EditScope): Finding[] {
  if (scope.sections.includes('*')) return []
  const after = new Map(s1.map((s) => [s.id, s]))
  const out: Finding[] = []
  for (const s of s0.filter((x) => !scope.sections.includes(x.id))) {
    const now = after.get(s.id)
    if (!now) out.push(error('scope_section_removed', 'index.html', `section ${s.id} is protected and was removed`))
    else if (now.sha256 !== s.sha256)
      out.push(
        error('scope_section_changed', 'index.html', `section ${s.id} is protected and changed`, { line: now.line }),
      )
  }
  return out
}

const textOf = (files: readonly SourceFile[], path: SourcePath): string | null => fileOf(files, path)?.text ?? null

/** Every change between two packages that the scope does not allow. */
export function scopeFindings(
  before: readonly SourceFile[],
  after: readonly SourceFile[],
  scope: EditScope,
): Finding[] {
  const html0 = textOf(before, 'index.html') ?? ''
  const html1 = textOf(after, 'index.html') ?? ''
  const s0 = sectionsOf(parseDocument(html0), html0)
  const s1 = sectionsOf(parseDocument(html1), html1)
  const out = sectionScopeFindings(s0, s1, scope)
  if (!scope.shell && shellOf(html0, s0) !== shellOf(html1, s1)) {
    out.push(
      error(
        'scope_shell_changed',
        'index.html',
        'the page outside the editable sections changed (head, header, footer or the section list)',
      ),
    )
  }
  if (!scope.styles && textOf(before, 'styles.css') !== textOf(after, 'styles.css')) {
    out.push(
      error(
        'scope_styles_changed',
        'styles.css',
        'the shared stylesheet is protected and changed; a local change belongs in the edited section',
      ),
    )
  }
  return out
}
