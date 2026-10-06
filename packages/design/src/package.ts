// A design source package and its compiled deliverable (SDD-01, pack 05 §3–§4). The editable source is `index.html` with
// an optional `styles.css`; its identity is a hash over the files' hashes, so the same files are the same revision on
// any machine. Each top-level section (`data-section`) has a span in `index.html` and a hash, which scoped edits
// compare. The deliverable is one self-contained HTML file: the stylesheet inlined, the profile's Content Security
// Policy first in `<head>`, nothing that runs or loads. The same source compiles to the same bytes.

import { createHash } from 'node:crypto'
import { defaultTreeAdapter, serialize } from 'parse5'
import { attr, elements, first, lineAt, parseDocument, setAttr, type Document, type Element } from './dom.ts'
import { shownLabels } from './framing.ts'

export const SOURCE_PATHS = ['index.html', 'styles.css'] as const
export type SourcePath = (typeof SOURCE_PATHS)[number]

export interface SourceFile {
  readonly path: SourcePath
  readonly text: string
}

export interface FileIdentity {
  readonly path: SourcePath
  readonly sha256: string
  readonly bytes: number
}

export interface Section {
  readonly id: string
  /** The element's outer span in `index.html`: [start, end) in UTF-16 units. */
  readonly start: number
  readonly end: number
  readonly line: number
  readonly sha256: string
}

/** The designed HTML profile. A change to what compile writes, or to the policy, is a new profile id. */
export const DESIGN_PROFILE = 'html-design-v1'
/** The compiled page's only policy: nothing loads, nothing runs, its own inline styles apply. */
export const DESIGN_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"

export const sha256Hex = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')

export function fileIdentity(file: SourceFile): FileIdentity {
  return { path: file.path, sha256: sha256Hex(file.text), bytes: Buffer.byteLength(file.text, 'utf8') }
}

/** Code-point order: the same everywhere, whatever the locale. */
const byCodePoint = (a: string, b: string): number => (a === b ? 0 : a < b ? -1 : 1)

/** The package's identity: the files' identities in path order, hashed. */
export function packageSha256(files: readonly SourceFile[]): string {
  const lines = files
    .map(fileIdentity)
    .toSorted((a, b) => byCodePoint(a.path, b.path))
    .map((f) => `${f.path} ${f.sha256} ${f.bytes}\n`)
  return sha256Hex(`sophia.design-source.v1\n${lines.join('')}`)
}

export function fileOf(files: readonly SourceFile[], path: SourcePath): SourceFile | undefined {
  return files.find((f) => f.path === path)
}

/** The top-level sections of a parsed `index.html`, in document order, with their authored spans. */
export function sectionsOf(doc: Document, html: string): Section[] {
  const out: Section[] = []
  for (const el of elements(doc)) {
    const id = attr(el, 'data-section')
    const loc = el.sourceCodeLocation
    if (id === null || !loc) continue
    out.push({
      id,
      start: loc.startOffset,
      end: loc.endOffset,
      line: lineAt(html, loc.startOffset),
      sha256: sha256Hex(html.slice(loc.startOffset, loc.endOffset)),
    })
  }
  return out
}

/** `index.html` with every section's span replaced by a marker: what an edit inside sections must leave unchanged. */
export function shellOf(html: string, sections: readonly Section[]): string {
  let out = ''
  let at = 0
  for (const s of sections.toSorted((a, b) => a.start - b.start)) {
    out += `${html.slice(at, s.start)}<!--section ${s.id}-->`
    at = s.end
  }
  return out + html.slice(at)
}

function ensureChild(parent: Element, tag: string, before: Element | null): Element {
  const el = defaultTreeAdapter.createElement(tag, parent.namespaceURI, [])
  if (before) defaultTreeAdapter.insertBefore(parent, el, before)
  else defaultTreeAdapter.appendChild(parent, el)
  return el
}

function metaFirst(head: Element, attrs: Record<string, string>): void {
  const meta = ensureChild(head, 'meta', head.childNodes.find((n): n is Element => 'tagName' in n) ?? null)
  for (const [name, value] of Object.entries(attrs)) setAttr(meta, name, value)
}

/**
 * The deliverable: one self-contained HTML document. The authored `<meta charset>` is replaced by the compile's own, the
 * policy and a generator line naming the profile and source come first in `<head>`, and `styles.css` becomes the last
 * `<style>` of `<head>`. `lang` is set to the admitted language when the page names none.
 */
/** Mark the labels a tooltip, a name or a reference rests on: the capture kernel measures each as it measures a block. */
function markShown(doc: Document): void {
  for (const [i, label] of shownLabels(doc).entries()) {
    const id = attr(label, 'id')
    setAttr(label, 'data-sophia-shown', `${label.tagName}${id === null ? `:${i + 1}` : `#${id}`}`)
  }
}

export function compile(files: readonly SourceFile[], language: string): string {
  const html = fileOf(files, 'index.html')?.text ?? ''
  const css = fileOf(files, 'styles.css')?.text
  const doc = parseDocument(html)
  const root = first(doc, 'html')
  const head = first(doc, 'head')
  if (!root || !head) return ''
  if (attr(root, 'lang') === null) setAttr(root, 'lang', language)
  markShown(doc)
  for (const meta of elements(head).filter((el) => el.tagName === 'meta' && attr(el, 'charset') !== null)) {
    defaultTreeAdapter.detachNode(meta)
  }
  if (css !== undefined && css.length > 0) defaultTreeAdapter.insertText(ensureChild(head, 'style', null), css)
  metaFirst(head, { name: 'generator', content: `Sophia ${DESIGN_PROFILE}; source sha256:${packageSha256(files)}` })
  metaFirst(head, { 'http-equiv': 'Content-Security-Policy', content: DESIGN_CSP })
  metaFirst(head, { charset: 'utf-8' })
  const doctype = doc.childNodes.some((n) => n.nodeName === '#documentType')
  return `${doctype ? '' : '<!DOCTYPE html>'}${serialize(doc)}\n`
}
