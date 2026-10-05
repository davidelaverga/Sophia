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

/** Whether `el` has an ancestor (not itself) that `test` matches. */
export function hasAncestor(el: Element, test: (a: Element) => boolean): boolean {
  for (let p = el.parentNode; p && isElement(p); p = p.parentNode) if (test(p)) return true
  return false
}

/** Text compared as content: Unicode NFC, every run of white space one space, trimmed. */
export const normalizeText = (text: string): string => text.normalize('NFC').replace(/\s+/gu, ' ').trim()

/** The 1-based line of an offset in a text, for findings a person can locate. */
export function lineAt(text: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1
  return line
}
