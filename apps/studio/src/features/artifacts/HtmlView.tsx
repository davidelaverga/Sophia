// A designed HTML version (SDD-01): the stored page's bytes, checked against the rendition's hash, in an isolated
// frame. The frame is sandboxed with no permission at all (no scripts, no same origin, no forms, no popups, no top
// navigation), so the page cannot run, reach Studio's DOM, cookies or storage, or send anything; its own Content
// Security Policy, written by the compiler, refuses every load besides. It is never parsed into Studio's DOM and never
// passes through MarkdownView. Above it, in Studio's words, how it was reviewed and what it says it could not do. Its
// links to its own fragments (an inline citation's to its source entry) are framed to stay in the page; a page whose
// links can't be kept so is not framed, and the reader is offered the version's other formats (in-page-links.ts). Nor
// is one whose citations would move within its frame where the browser can't step Close past those moves
// (own-history.ts).
import { useMemo, type ReactNode } from 'react'
import type { ArtifactRendition } from '@sophia/contracts'
import { framed } from './in-page-links.ts'
import { ownHistory } from './own-history.ts'
import type { ViewerFormat } from './report-link.ts'

/** What a designed page's review state means to a reader, in one sentence. */
export function reviewWords(state: ArtifactRendition['reviewState']): string {
  if (state === 'reviewed') return 'Designed by Sophia and checked by a separate visual reviewer.'
  if (state === 'review_unresolved') {
    return 'Designed by Sophia. Its visual review still had findings when it was published; they are listed below.'
  }
  return 'Designed by Sophia and checked by software only: no separate visual reviewer looked at it.'
}

/**
 * The design check as a short tag for cards and the viewer's head: named for what checked it, so it never reads as the
 * team's review (ReviewRow's «Not reviewed yet.» sits right under it).
 */
export function reviewTag(state: ArtifactRendition['reviewState']): string {
  if (state === 'reviewed') return 'design checked'
  if (state === 'review_unresolved') return 'design findings open'
  return 'software-checked only'
}

interface Props {
  /** The page's checked text. */
  html: string
  title: string
  rendition: ArtifactRendition
  full: boolean
  /** Beside the review's sentence: «Revise with Sophia…», for those who may ask (ReviseSections). */
  revise?: ReactNode
  /** The version's other formats, offered when the page can't be shown here. */
  others: readonly ViewerFormat[]
  onFormat: (format: ViewerFormat) => void
}

const READ_AS: Record<ViewerFormat, string> = { markdown: 'Read as Markdown', pdf: 'Read as PDF', html: 'Read as HTML' }

/** Why a designed page isn't framed, in the reader's words. */
const NOT_SHOWN = {
  // Its citations link within it in a way the viewer can't keep in the frame without changing how the page looks, and
  // framed as it is a click on one would empty the frame.
  links:
    'This designed page isn’t shown here: its citations link within the page in a way this viewer can’t follow without changing how the page looks.',
  // Its citations would move within the frame, and this browser has no way to step Close past those moves.
  history:
    'This designed page isn’t shown in this browser: here, following one of its citations would keep Close from closing the report.',
} as const

/**
 * A designed page that can't be shown here (NOT_SHOWN). Never framed; the reader is sent to the version's other
 * formats, and Download keeps the page as it was checked.
 */
function NotShown({ why, others, onFormat }: Pick<Props, 'others' | 'onFormat'> & { why: keyof typeof NOT_SHOWN }) {
  return (
    <div className="report-html-refused" role="note">
      <p>{NOT_SHOWN[why]} Download keeps the page as it is.</p>
      <p>
        {others.map((format) => (
          <button key={format} type="button" className="text-button" onClick={() => onFormat(format)}>
            {READ_AS[format]}
          </button>
        ))}
      </p>
    </div>
  )
}

export function HtmlView({ html, title, rendition, full, revise, others, onFormat }: Props) {
  const limits = rendition.limitations ?? []
  const page = useMemo(() => framed(html), [html])
  if (page === null) return <NotShown why="links" others={others} onFormat={onFormat} />
  // Its links kept in it, a click on one is a move of the frame's, an entry in the tab's history (own-history.ts).
  if (page !== html && !ownHistory()) return <NotShown why="history" others={others} onFormat={onFormat} />
  return (
    <div className="report-html" data-full={full || undefined}>
      <div className="report-html-head">
        <p className="report-format-note" role="note" data-review={rendition.reviewState ?? 'self_review_only'}>
          {reviewWords(rendition.reviewState)}
        </p>
        {revise}
      </div>
      {limits.length > 0 && (
        <section className="report-limits" aria-label="Limitations of the design">
          <h3>Limitations</h3>
          <ul>
            {limits.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}
      <iframe
        className="report-html-frame"
        title={`${title}, designed page`}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={page}
      />
    </div>
  )
}
