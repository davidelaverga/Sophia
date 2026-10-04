// A report's Markdown on screen (plan §2.8.3): a 68ch reading measure, tables in scroll wrappers, code in plain
// <pre>, citations as superscript links into the Sources tab. Everything is rendered as React text from the parsed
// blocks (markdown.ts); nothing is set as HTML. Headings drop one level under the viewer's own title.
import { Fragment } from 'react'
import type { Block, Inline, ParsedReport } from './markdown.ts'

interface Props {
  /** The parsed report (parseMarkdown): its citation numbers are the Sources tab's. */
  report: ParsedReport
  /** Opens a cited source in the Sources tab. */
  onCite: (sourceId: string) => void
}

export function MarkdownView({ report, onCite }: Props) {
  return (
    <div className="md">
      <Blocks blocks={report.blocks} onCite={onCite} />
    </div>
  )
}

function Blocks({ blocks, onCite }: { blocks: readonly Block[]; onCite: Props['onCite'] }) {
  return blocks.map((b, i) => <BlockView key={i} block={b} onCite={onCite} />)
}

const HEADINGS = ['h2', 'h3', 'h4', 'h5', 'h6', 'h6'] as const

function BlockView({ block, onCite }: { block: Block; onCite: Props['onCite'] }) {
  switch (block.kind) {
    case 'heading': {
      const H = HEADINGS[block.level - 1] ?? 'h6'
      return (
        <H id={block.anchor ? `md-${block.anchor}` : undefined}>
          <Inlines inline={block.children} onCite={onCite} />
        </H>
      )
    }
    case 'paragraph':
      return (
        <p>
          <Inlines inline={block.children} onCite={onCite} />
        </p>
      )
    case 'list':
      return <ListView block={block} onCite={onCite} />
    case 'quote':
      return (
        <blockquote>
          <Blocks blocks={block.blocks} onCite={onCite} />
        </blockquote>
      )
    case 'code':
      return (
        <pre data-lang={block.lang ?? undefined}>
          <code>{block.text}</code>
        </pre>
      )
    case 'table':
      return <TableView block={block} onCite={onCite} />
    case 'rule':
      return <hr />
    default:
      return null
  }
}

function ListView({ block, onCite }: { block: Extract<Block, { kind: 'list' }>; onCite: Props['onCite'] }) {
  const items = block.items.map((item, i) => (
    <li key={i} data-depth={item.depth || undefined}>
      <Inlines inline={item.children} onCite={onCite} />
    </li>
  ))
  return block.ordered ? <ol start={block.start}>{items}</ol> : <ul>{items}</ul>
}

function TableView({ block, onCite }: { block: Extract<Block, { kind: 'table' }>; onCite: Props['onCite'] }) {
  const align = (k: number) => block.align[k] ?? undefined
  return (
    <div className="md-table" tabIndex={0} role="region" aria-label="Table">
      <table>
        <thead>
          <tr>
            {block.head.map((cell, k) => (
              <th key={k} style={{ textAlign: align(k) }}>
                <Inlines inline={cell} onCite={onCite} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, k) => (
                <td key={k} style={{ textAlign: align(k) }}>
                  <Inlines inline={cell} onCite={onCite} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Inlines({ inline, onCite }: { inline: readonly Inline[]; onCite: Props['onCite'] }) {
  return inline.map((node, i) => <InlineView key={i} node={node} onCite={onCite} />)
}

function InlineView({ node, onCite }: { node: Inline; onCite: Props['onCite'] }) {
  switch (node.kind) {
    case 'text':
      return <Fragment>{node.text}</Fragment>
    case 'strong':
      return (
        <strong>
          <Inlines inline={node.children} onCite={onCite} />
        </strong>
      )
    case 'em':
      return (
        <em>
          <Inlines inline={node.children} onCite={onCite} />
        </em>
      )
    case 'code':
      return <code>{node.text}</code>
    case 'link':
      return (
        <a href={node.href} target="_blank" rel="noopener noreferrer">
          <Inlines inline={node.children} onCite={onCite} />
        </a>
      )
    case 'cite':
      return (
        <sup className="cite">
          <button type="button" onClick={() => onCite(node.sourceId)} aria-label={`Source ${node.n}`}>
            {node.n}
          </button>
        </sup>
      )
    case 'break':
      return <br />
    default:
      return null
  }
}
