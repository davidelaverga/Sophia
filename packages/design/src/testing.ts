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

/** A table block as a table of its own shape: its head row of header cells, then its rows. */
function tableHtml(b: ContentBlock, order: readonly string[]): string {
  const cell = (tag: 'th' | 'td', text: string, first: boolean): string =>
    `<${tag}>${esc(text)}${first ? cites(b, order) + links(b) : ''}</${tag}>`
  const rows: string[] = []
  let at = 0
  for (const [r, n] of b.rows.entries()) {
    const tag = r === 0 ? 'th' : 'td'
    rows.push(
      `<tr>${b.cells
        .slice(at, at + n)
        .map((c, i) => cell(tag, c, at + i === 0))
        .join('')}</tr>`,
    )
    at += n
  }
  const [head = '', ...body] = rows
  const tbody = body.length > 0 ? `<tbody>${body.join('')}</tbody>` : ''
  return `<div role="region" aria-label="Table ${b.id}" tabindex="0"><table data-block="${b.id}"><thead>${head}</thead>${tbody}</table></div>`
}

function blockHtml(b: ContentBlock, order: readonly string[]): string {
  if (b.kind === 'table') return tableHtml(b, order)
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
<section id="sources" data-section="sources"><h2>Sources</h2><ul>
${sources}
</ul></section>
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
