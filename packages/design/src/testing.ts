// For tests only (SDD-01): a plain page that satisfies a content package's coverage, so tests in other packages can
// store, render and review a valid designed source without a model. It is deliberately undesigned: it is never offered
// as a deliverable, and nothing in the product imports it.

import { type ContentBlock, type ContentPackage } from './blocks.ts'
import { type SourceFile } from './package.ts'

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Each citation as a bracketed number, the source's place in the package's citation order. */
const cites = (b: ContentBlock, order: readonly string[]): string =>
  b.citations.map((id) => `<a data-cite="${id}" href="#src-${id}">[${order.indexOf(id) + 1}]</a>`).join('')
const links = (b: ContentBlock): string => b.links.map((href) => ` <a href="${esc(href)}"></a>`).join('')

function blockHtml(b: ContentBlock, order: readonly string[]): string {
  if (b.kind === 'table') {
    const cells = b.cells.map((c, i) => `<td>${esc(c)}${i === 0 ? cites(b, order) + links(b) : ''}</td>`).join('')
    return `<div role="region" aria-label="Table ${b.id}" tabindex="0"><table data-block="${b.id}"><tbody><tr>${cells}</tr></tbody></table></div>`
  }
  if (b.kind === 'item') return `<ul><li data-block="${b.id}">${esc(b.text)}${cites(b, order)}${links(b)}</li></ul>`
  if (b.kind === 'code') return `<pre data-block="${b.id}"><code>${esc(b.text)}</code></pre>`
  return `<p data-block="${b.id}">${esc(b.text)}${cites(b, order)}${links(b)}</p>`
}

export interface PageOptions {
  readonly title?: string
  readonly css?: string
  /** Blocks per section (each section `s1`, `s2`, …); all in one section by default. */
  readonly perSection?: number
  readonly language?: string
}

/** A valid, plain source package for `content`. */
export function plainPage(content: ContentPackage, options: PageOptions = {}): SourceFile[] {
  const per = options.perSection ?? Math.max(content.blocks.length, 1)
  const sections: string[] = []
  for (let i = 0; i < Math.max(content.blocks.length, 1); i += per) {
    const body = content.blocks
      .slice(i, i + per)
      .map((b) => blockHtml(b, content.citations))
      .join('\n')
    sections.push(`<section id="s${sections.length + 1}" data-section="s${sections.length + 1}">\n${body}\n</section>`)
  }
  const sources = content.citations.map((id) => `<li id="src-${id}" data-source="${id}">Source ${id}</li>`).join('\n')
  const html = `<!doctype html>
<html lang="${options.language ?? 'en'}">
<head><title>${esc(options.title ?? 'Report')}</title></head>
<body>
<main>
<h1>${esc(options.title ?? 'Report')}</h1>
${sections.join('\n')}
<section id="sources" data-section="sources"><h2>Sources</h2><ol>
${sources}
</ol></section>
</main>
</body>
</html>
`
  const css =
    options.css ?? 'body { font: 18px/1.6 Georgia, serif; margin: 0 auto; max-width: 42rem; padding: 1rem; }\n'
  return [
    { path: 'index.html', text: html },
    { path: 'styles.css', text: css },
  ]
}
