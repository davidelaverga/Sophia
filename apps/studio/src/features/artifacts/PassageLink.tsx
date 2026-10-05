// «Link» in the passage bar (docs/plans/room-passage-link.md): a link to the passage of the version on screen, copied;
// where the clipboard refuses, the link is shown, selected, to copy by hand.
import { useEffect, useRef, useState } from 'react'
import { passageLink, type Locator } from './passage-link.ts'

type Copied = { status: 'none' } | { status: 'copied' } | { status: 'refused'; link: string }

const SHOWN_MS = 5000

/** Copies a passage's link: copied says so for a few seconds; refused shows the link until the next. */
export function useLinkCopy() {
  const [copied, setCopied] = useState<Copied>({ status: 'none' })
  useEffect(() => {
    if (copied.status !== 'copied') return undefined
    const timer = setTimeout(() => setCopied({ status: 'none' }), SHOWN_MS)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = (report: { artifactId: string; versionId: string }, at: Locator) => {
    const link = passageLink(window.location, report, at)
    const refused = () => setCopied({ status: 'refused', link })
    // Asked inside the press, as the clipboard requires. Where there is none (a page that isn't secure, an old app view)
    // or it refuses, the link is shown to copy by hand.
    try {
      navigator.clipboard.writeText(link).then(() => setCopied({ status: 'copied' }), refused)
    } catch {
      refused()
    }
  }
  return { copied, copy }
}

/** What Link did: copied, or the link to copy by hand. Mounted all along, so what it says is announced. */
export function LinkedLine({ copied }: { copied: Copied }) {
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (copied.status !== 'refused') return
    field.current?.focus({ preventScroll: true })
    field.current?.select()
  }, [copied])
  return (
    <p className="passage-linked" role="status">
      {copied.status === 'copied' && 'Link copied.'}
      {copied.status === 'refused' && (
        <>
          Copy this link:
          <input ref={field} readOnly value={copied.link} aria-label="Link to the passage" />
        </>
      )}
    </p>
  )
}
