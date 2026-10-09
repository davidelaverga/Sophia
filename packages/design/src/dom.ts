// Small, typed helpers over parse5's default tree (SDD-01). Pure: they read a parsed document and never mutate it, except
// `setAttr` and `append`, which compile.ts uses on its own fresh copy.

import { html as htmlSpec, parse, type DefaultTreeAdapterTypes } from 'parse5'

export type Document = DefaultTreeAdapterTypes.Document
export type Element = DefaultTreeAdapterTypes.Element
export type ChildNode = DefaultTreeAdapterTypes.ChildNode
export type ParentNode = DefaultTreeAdapterTypes.ParentNode
export type TextNode = DefaultTreeAdapterTypes.TextNode

/** A parsed document with source offsets, so a section's authored bytes can be found again. */
export function parseDocument(html: string): Document {
  return parse(html, { sourceCodeLocationInfo: true, scriptingEnabled: false })
}

export function isElement(node: ChildNode | ParentNode): node is Element {
  return 'tagName' in node
}

export function isText(node: ChildNode): node is TextNode {
  return node.nodeName === '#text'
}

/** Whether the element is in the HTML namespace (an `svg` or `math` subtree is not). */
export const inHtml = (el: Element): boolean => el.namespaceURI === htmlSpec.NS.HTML

export function attr(el: Element, name: string): string | null {
  return el.attrs.find((a) => a.name === name)?.value ?? null
}

export function setAttr(el: Element, name: string, value: string): void {
  const found = el.attrs.find((a) => a.name === name)
  if (found) found.value = value
  else el.attrs.push({ name, value })
}

/** The children of a node, through a `template`'s content as well. */
function childrenOf(node: ParentNode): ChildNode[] {
  return 'content' in node ? [...node.childNodes, ...node.content.childNodes] : node.childNodes
}

/** Every element below `root`, in document order (iterative: no recursion depth limit on hostile nesting). */
export function elements(root: ParentNode): Element[] {
  const out: Element[] = []
  const stack: ChildNode[] = childrenOf(root).toReversed()
  for (let node = stack.pop(); node; node = stack.pop()) {
    if (!isElement(node)) continue
    out.push(node)
    stack.push(...childrenOf(node).toReversed())
  }
  return out
}

export function first(root: ParentNode, tag: string): Element | null {
  return elements(root).find((el) => el.tagName === tag) ?? null
}

/**
 * The text of an element as a reader sees it in order, skipping any descendant `skip` matches (and that descendant's
 * whole subtree). `br` reads as a space.
 */
export function textOf(root: Element, skip: (el: Element) => boolean = () => false): string {
  let out = ''
  const stack: ChildNode[] = root.childNodes.toReversed()
  for (let node = stack.pop(); node; node = stack.pop()) {
    if (isText(node)) out += node.value
    else if (isElement(node) && !skip(node)) {
      if (node.tagName === 'br') out += ' '
      stack.push(...node.childNodes.toReversed())
    }
  }
  return out
}

/**
 * The text of an element as textOf reads it, within a budget shared across calls: each node read and each character
 * taken spends one. Null, the budget spent, when the text is not read whole.
 */
export function textWithin(root: Element, budget: { left: number }): string | null {
  let out = ''
  const stack: ChildNode[] = root.childNodes.toReversed()
  for (let node = stack.pop(); node; node = stack.pop()) {
    budget.left -= 1
    if (isText(node)) {
      out += node.value
      budget.left -= node.value.length
    } else if (isElement(node)) {
      if (node.tagName === 'br') out += ' '
      stack.push(...node.childNodes.toReversed())
    }
    if (budget.left < 0) return null
  }
  return out
}

/** Whether `el` has an ancestor (not itself) that `test` matches. */
export function hasAncestor(el: Element, test: (a: Element) => boolean): boolean {
  for (let p = el.parentNode; p && isElement(p); p = p.parentNode) if (test(p)) return true
  return false
}

/** Text compared as content: Unicode NFC, every run of white space one space, trimmed. */
export const normalizeText = (text: string): string => text.normalize('NFC').replace(/\s+/gu, ' ').trim()

/** Where the last text asked about breaks its lines: every element's finding reads the same page. */
let lines: { readonly text: string; readonly breaks: readonly number[] } | null = null

/**
 * The 1-based line of an offset in a text, for findings a person can locate. The text's line breaks are found once,
 * so a page with many elements is not read again for each (#117).
 */
export function lineAt(text: string, offset: number): number {
  if (lines?.text !== text) {
    const breaks: number[] = []
    for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) breaks.push(i)
    lines = { text, breaks }
  }
  const { breaks } = lines
  let low = 0
  let high = breaks.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if ((breaks[mid] ?? Infinity) < offset) low = mid + 1
    else high = mid
  }
  return low + 1
}

/** How deep a document nests its elements (iterative: hostile nesting has no depth limit of its own). */
export function depthOf(root: ParentNode): number {
  let deepest = 0
  const stack: { node: ChildNode; depth: number }[] = childrenOf(root).map((node) => ({ node, depth: 1 }))
  for (let top = stack.pop(); top; top = stack.pop()) {
    if (!isElement(top.node)) continue
    deepest = Math.max(deepest, top.depth)
    for (const node of childrenOf(top.node)) stack.push({ node, depth: top.depth + 1 })
  }
  return deepest
}
