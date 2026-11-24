import { parse, walk } from 'css-tree'
import { attr, elements, isElement, isText, parseDocument, type Element } from './dom.ts'

const NAVIGABLE_ELEMENTS = new Set(['applet', 'base', 'embed', 'frame', 'iframe', 'link', 'object', 'portal'])
const EXTERNAL_ATTRIBUTES = new Set([
  'action',
  'archive',
  'codebase',
  'formaction',
  'ping',
  'poster',
  'srcdoc',
  'srcset',
])
const LOCAL_FRAGMENT = /^#[\w.:-]*$/u
const INLINE_IMAGE = /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[a-z0-9+/]+=*$/iu

function allowedHref(element: Element, value: string): boolean {
  return LOCAL_FRAGMENT.test(value) || (element.tagName === 'image' && INLINE_IMAGE.test(value))
}

function styleIsLocal(css: string, context: 'stylesheet' | 'declarationList'): boolean {
  let local = true
  try {
    const ast = parse(css, {
      context,
      parseCustomProperty: true,
      onParseError: () => {
        local = false
      },
    })
    walk(ast, (node) => {
      if (node.type === 'Atrule' && node.name.toLowerCase() === 'import') local = false
      if (node.type === 'Url' && !LOCAL_FRAGMENT.test(node.value) && !INLINE_IMAGE.test(node.value)) local = false
      if (node.type === 'Function' && /^(?:-webkit-)?image-set$/iu.test(node.name)) local = false
    })
  } catch {
    return false
  }
  return local
}

function attributeIsLocal(element: Element, name: string, value: string): boolean {
  if (EXTERNAL_ATTRIBUTES.has(name)) return false
  if (name === 'href') return allowedHref(element, value)
  if (name === 'src') return element.tagName === 'img' && INLINE_IMAGE.test(value)
  if (name === 'style') return styleIsLocal(value, 'declarationList')
  return true
}

function elementIsLocal(element: Element): boolean {
  if (NAVIGABLE_ELEMENTS.has(element.tagName) || (element.tagName === 'meta' && attr(element, 'http-equiv'))) {
    return false
  }
  if (!element.attrs.every(({ name, value }) => attributeIsLocal(element, name.toLowerCase(), value.trim()))) {
    return false
  }
  if (element.tagName !== 'style') return true
  return styleIsLocal(
    element.childNodes
      .filter(isText)
      .map((node) => node.value)
      .join(''),
    'stylesheet',
  )
}

/** Reject declared remote dependencies. Script runtime behavior still depends on the separate host and sandbox. */
export function hasOnlyLocalPrototypeResources(entry: Uint8Array): boolean {
  return elements(parseDocument(new TextDecoder().decode(entry))).every(elementIsLocal)
}

/** Find the first explicit head slot, or the safe position after the document prelude of an implicit head. */
export function prototypeBootstrapOffset(source: string): number {
  const doc = parseDocument(source, true)
  let offset = 0
  for (const node of doc.childNodes) {
    if (isElement(node)) {
      const head = node.childNodes.find((child): child is Element => isElement(child) && child.tagName === 'head')
      return head?.sourceCodeLocation?.startTag?.endOffset ?? node.sourceCodeLocation?.startTag?.endOffset ?? offset
    }
    offset = node.sourceCodeLocation?.endOffset ?? offset
  }
  return offset
}
