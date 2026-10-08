// A designed HTML version (SDD-01): the stored page's bytes, checked against the rendition's hash, in an isolated
// frame. The frame is sandboxed with no permission at all (no scripts, no same origin, no forms, no popups, no top
// navigation), so the page cannot run, reach Studio's DOM, cookies or storage, or send anything; its own Content
// Security Policy, written by the compiler, refuses every load besides. It is never parsed into Studio's DOM and never
// passes through MarkdownView. Above it, in Studio's words, how it was reviewed and what it says it could not do.
import type { ArtifactRendition } from '@sophia/contracts'

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
}

export function HtmlView({ html, title, rendition, full }: Props) {
  const limits = rendition.limitations ?? []
  return (
    <div className="report-html" data-full={full || undefined}>
      <p className="report-format-note" role="note" data-review={rendition.reviewState ?? 'self_review_only'}>
        {reviewWords(rendition.reviewState)}
      </p>
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
        srcDoc={html}
      />
    </div>
  )
}
