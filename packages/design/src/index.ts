// @sophia/design: the designed HTML profile's source model and its deterministic checks (SDD-01). The API runs these on
// every source the native designer writes or patches; nothing here calls a model, a browser or the network.
//
// - `checkSource`: the static profile (parser-checked HTML and CSS), the frozen content's coverage, the package's
//   identity and sections. Unsafe source is never stored; incomplete source is stored with its findings and cannot be
//   submitted as a candidate.
// - `reviseSource`: exact, unique edits against a base, then the scope check.
// - `compile`: the one self-contained deliverable.

import { contentPackage, type ContentPackage } from './blocks.ts'
import { checkCoverage } from './coverage.ts'
import { unifiedDiff } from './diff.ts'
import { parseDocument } from './dom.ts'
import { bounded, error, hasErrors, type Finding } from './findings.ts'
import {
  fileIdentity,
  fileOf,
  packageSha256,
  sectionsOf,
  SOURCE_PATHS,
  type FileIdentity,
  type Section,
  type SourceFile,
} from './package.ts'
import { applyEdits, scopeFindings, type Edit, type EditScope } from './patch.ts'
import { checkPolicy } from './policy.ts'

export { comparable, contentPackage, type ContentBlock, type ContentKind, type ContentPackage } from './blocks.ts'
export { checkCss, CSS_BYTES } from './css.ts'
export { DIFF_CHARS, unifiedDiff } from './diff.ts'
export { type Finding, type Severity } from './findings.ts'
export {
  compile,
  DESIGN_CSP,
  DESIGN_PROFILE,
  packageSha256,
  sha256Hex,
  SOURCE_PATHS,
  type FileIdentity,
  type Section,
  type SourceFile,
  type SourcePath,
} from './package.ts'
export { FULL_SCOPE, type Edit, type EditScope } from './patch.ts'
export { HTML_BYTES, SECTION_ID } from './policy.ts'

export interface SourceCheck {
  readonly sha256: string
  readonly files: readonly FileIdentity[]
  readonly sections: readonly Section[]
  /** Breaks the static profile: never stored. */
  readonly unsafe: boolean
  /** Every block, citation and source in place: may become a candidate (after its render passes). */
  readonly complete: boolean
  readonly findings: readonly Finding[]
  /** How many findings there were; `findings` holds at most 200. */
  readonly findingCount: number
}

function shapeFindings(files: readonly SourceFile[]): Finding[] {
  const out: Finding[] = []
  const paths = files.map((f) => f.path)
  if (!paths.includes('index.html')) out.push(error('no_index', 'package', 'a source package has index.html'))
  if (new Set(paths).size !== paths.length) out.push(error('duplicate_file', 'package', 'a file appears twice'))
  for (const p of paths)
    if (!(SOURCE_PATHS as readonly string[]).includes(p))
      out.push(error('bad_path', 'package', `${p} is not index.html or styles.css`))
  return out
}

/** Every deterministic fact about a source package against its frozen content. */
export function checkSource(files: readonly SourceFile[], content: ContentPackage): SourceCheck {
  const shape = shapeFindings(files)
  const html = fileOf(files, 'index.html')?.text ?? ''
  const css = fileOf(files, 'styles.css')?.text ?? null
  const doc = parseDocument(html)
  const policy = shape.length > 0 ? shape : checkPolicy(doc, html, css)
  const coverage = hasErrors(policy) ? [] : checkCoverage(doc, html, content)
  const all = [...policy, ...coverage]
  const { findings, total } = bounded(all)
  return {
    sha256: packageSha256(files),
    files: files.map(fileIdentity),
    sections: sectionsOf(doc, html),
    unsafe: hasErrors(policy),
    complete: !hasErrors(all),
    findings,
    findingCount: total,
  }
}

export type Revision =
  | { readonly ok: true; readonly files: SourceFile[]; readonly check: SourceCheck; readonly diff: string }
  | { readonly ok: false; readonly findings: readonly Finding[] }

/**
 * Edits applied to a base package, checked against the scope and then as a source. Refused (nothing to store) when an
 * edit cannot apply exactly, a change leaves the scope, or the result breaks the static profile.
 */
export function reviseSource(
  base: readonly SourceFile[],
  edits: readonly Edit[],
  scope: EditScope,
  content: ContentPackage,
): Revision {
  const applied = applyEdits(base, edits)
  if (!applied.ok) return applied
  const outOfScope = scopeFindings(base, applied.files, scope)
  if (outOfScope.length > 0) return { ok: false, findings: outOfScope }
  const check = checkSource(applied.files, content)
  if (check.unsafe) return { ok: false, findings: check.findings }
  const diff = SOURCE_PATHS.map((p) =>
    unifiedDiff(p, fileOf(base, p)?.text ?? '', fileOf(applied.files, p)?.text ?? ''),
  ).join('')
  return { ok: true, files: applied.files, check, diff }
}

/** The diff between two packages, every file. */
export function packageDiff(before: readonly SourceFile[], after: readonly SourceFile[]): string {
  return SOURCE_PATHS.map((p) => unifiedDiff(p, fileOf(before, p)?.text ?? '', fileOf(after, p)?.text ?? '')).join('')
}

/** The frozen package of a version, for callers that only have its parts. */
export const contentOf = (
  markdown: string,
  limitations: readonly string[],
  citable?: Iterable<string>,
): ContentPackage => contentPackage(markdown, limitations, citable)
