// A report's Markdown on screen (plan §2.8.3), read as its HTML page reads it (html-report-v2, SPEC §4b): one reading
// measure, tables in scroll wrappers, code in plain <pre>, citations as superscript buttons into the Sources tab. A
// citation stays on the line of the word before it, adjacent ones are one group with commas, and one whose source was
// read only in part, as a snippet or not at all is marked and named so, in the report's language (cite-view.ts).
// Everything is rendered as React text from the parsed blocks (markdown.ts); nothing is set as HTML. Headings drop one
// level under the viewer's own title.
import { Fragment, useMemo } from 'react'
import type { ReportSource } from '@sophia/contracts'
import {
  bindCites,
  citeLabel,
  KEPT_WITH_WORD,
  weaknessOf,
  type Bound,
  type Cite,
  type Piece,
  type Weakness,
} from './cite-view.ts'
import type { Block, Inline, ParsedReport } from './markdown.ts'

interface Props {
  /** The parsed report (parseMarkdown): its citation numbers are the Sources tab's. */
  report: ParsedReport
  /** The version's sources, which mark a weak citation; undefined until they are read. */
  sources: readonly ReportSource[] | undefined
  /** The report's language (reportLanguage): a citation is named in it, and the text is marked with it. */
  language: string
  /** Opens a cited source in the Sources tab. */
  onCite: (sourceId: string) => void
}

/** What every citation needs: where it goes, how much of its source was read, and the words to name it. */
interface Citing {
  open: (sourceId: string) => void
  weakness: (sourceId: string) => Weakness | null
  language: string
}

export function MarkdownView({ report, sources, language, onCite }: Props) {
  const citing = useMemo<Citing>(() => {
    const listed = new Map((sources ?? []).map((s) => [s.sourceId, s]))
    return { open: onCite, weakness: (id) => weaknessOf(listed.get(id)), language }
  }, [sources, language, onCite])
  return (
    <div className="md" lang={language === 'und' ? undefined : language}>
      <Blocks blocks={report.blocks} citing={citing} />
    </div>
  )
}

function Blocks({ blocks, citing }: { blocks: readonly Block[]; citing: Citing }) {
  return blocks.map((b, i) => <BlockView key={i} block={b} citing={citing} />)
}

const HEADINGS = ['h2', 'h3', 'h4', 'h5', 'h6', 'h6'] as const

function BlockView({ block, citing }: { block: Block; citing: Citing }) {
  switch (block.kind) {
    case 'heading': {
      const H = HEADINGS[block.level - 1] ?? 'h6'
      return (
        <H id={block.anchor ? `md-${block.anchor}` : undefined}>
          <Inlines inline={block.children} citing={citing} />
        </H>
      )
    }
    case 'paragraph':
      return (
        <p>
          <Inlines inline={block.children} citing={citing} />
        </p>
      )
    case 'list':
      return <ListView block={block} citing={citing} />
    case 'quote':
      return (
        <blockquote>
          <Blocks blocks={block.blocks} citing={citing} />
        </blockquote>
      )
    case 'code':
      return (
        <pre data-lang={block.lang ?? undefined}>
          <code>{block.text}</code>
        </pre>
      )
    case 'table':
      return <TableView block={block} citing={citing} />
    case 'rule':
      return <hr />
    default:
      return null
  }
}

function ListView({ block, citing }: { block: Extract<Block, { kind: 'list' }>; citing: Citing }) {
  const items = block.items.map((item, i) => (
    <li key={i} data-depth={item.depth || undefined}>
      <Inlines inline={item.children} citing={citing} />
    </li>
  ))
  return block.ordered ? <ol start={block.start}>{items}</ol> : <ul>{items}</ul>
}

function TableView({ block, citing }: { block: Extract<Block, { kind: 'table' }>; citing: Citing }) {
  const align = (k: number) => block.align[k] ?? undefined
  return (
    <div className="md-table" tabIndex={0} role="region" aria-label="Table">
      <table>
        <thead>
          <tr>
            {block.head.map((cell, k) => (
              <th key={k} style={{ textAlign: align(k) }}>
                <Inlines inline={cell} citing={citing} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, k) => (
                <td key={k} style={{ textAlign: align(k) }}>
                  <Inlines inline={cell} citing={citing} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Inlines({ inline, citing }: { inline: readonly Inline[]; citing: Citing }) {
  return bindCites(inline).map((piece, i) => <PieceView key={i} piece={piece} citing={citing} />)
}

function PieceView({ piece, citing }: { piece: Piece; citing: Citing }) {
  switch (piece.kind) {
    case 'text':
      return <Fragment>{piece.text}</Fragment>
    case 'strong':
      return (
        <strong>
          <Inlines inline={piece.children} citing={citing} />
        </strong>
      )
    case 'em':
      return (
        <em>
          <Inlines inline={piece.children} citing={citing} />
        </em>
      )
    case 'code':
      return <code>{piece.text}</code>
    case 'link':
      return (
        <a href={piece.href} target="_blank" rel="noopener noreferrer">
          <Inlines inline={piece.children} citing={citing} />
        </a>
      )
    case 'bound':
      return <BoundCites bound={piece} citing={citing} />
    case 'break':
      return <br />
    default:
      return null
  }
}

/**
 * The word before a group of citations and the group's first numbers, on one line, the numbers joined by commas. A
 * longer group goes on after a comma, each further number with the comma after it, so it may wrap but never starts a
 * line with a comma.
 */
function BoundCites({ bound, citing }: { bound: Bound; citing: Citing }) {
  const more = bound.cites.slice(KEPT_WITH_WORD)
  return (
    <span className="cite-bound">
      <Inlines inline={bound.word} citing={citing} />
      <sup className="cite">
        {bound.cites.slice(0, KEPT_WITH_WORD).map((cite, k) => (
          <Fragment key={k}>
            {k > 0 && <Sep />}
            <CiteButton cite={cite} citing={citing} />
          </Fragment>
        ))}
        {more.length > 0 && (
          <span className="cite-more">
            <Sep />
            {more.map((cite, k) => (
              <span key={k}>
                <CiteButton cite={cite} citing={citing} />
                {k < more.length - 1 && <Sep />}
              </span>
            ))}
          </span>
        )}
      </sup>
    </span>
  )
}

function Sep() {
  return <span className="sep">,</span>
}

function CiteButton({ cite, citing }: { cite: Cite; citing: Citing }) {
  const weak = citing.weakness(cite.sourceId)
  return (
    <button
      type="button"
      data-weak={weak ?? undefined}
      onClick={() => citing.open(cite.sourceId)}
      aria-label={citeLabel(cite.n, weak, citing.language)}
    >
      {cite.n}
    </button>
  )
}
