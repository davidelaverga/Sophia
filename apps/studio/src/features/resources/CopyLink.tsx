// The open sheet's address, to share "look at this": copied and said so for a moment, or, when the browser refuses,
// said too, with where to find it instead. A sheet that doesn't write its anchor to the address bar gives its own
// address (work-copy-links.md); otherwise it is the address bar's. Refused, a link the address bar doesn't hold (a
// conversation opened by default, a goal opened from the list) is handed over under the press, selected, to copy by
// hand, as the room's passage link does, until Escape or a press elsewhere (Codex P2 on #382).
import { Icon, Tip, usePopover, type Popover } from '@sophia/ui'
import { useEffect, useRef, type FocusEvent, type KeyboardEvent } from 'react'
import { useCopy } from './copy.ts'

const LABEL = { idle: 'Copy link', copied: 'Link copied', failed: 'Couldn’t copy: the link is in the address bar' }
const BY_HAND = 'Couldn’t copy: copy the link below'

/** The address shown, or one given (a conversation's own, conversation-moves.md, even before the address names it). */
export function CopyLink({ href }: { href?: () => string }) {
  const { state, refused, copy, dismiss } = useCopy(href ?? (() => window.location.href))
  const held = refused !== null && refused !== window.location.href ? refused : null
  const pop = usePopover(held !== null, dismiss)
  const label = held === null ? LABEL[state] : BY_HAND
  // Escape closes the link alone: the sheet around it closes on an Escape that reaches it.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && held !== null) e.stopPropagation()
  }
  // The focus gone elsewhere on the page lets it go; the window losing it (to paste somewhere else) keeps it.
  const onBlur = (e: FocusEvent) => {
    if (e.relatedTarget instanceof Node && !e.currentTarget.contains(e.relatedTarget)) dismiss()
  }
  return (
    <span ref={pop.wrap} className="copy-link-at" onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        ref={pop.opener}
        type="button"
        className="round has-tip"
        data-copy={state}
        aria-label={label}
        onClick={copy}
      >
        <Icon name="link" />
        {held === null && <Tip label={label} side="bottom" align="end" />}
      </button>
      {held !== null && <ByHand link={held} popover={pop} />}
    </span>
  )
}

/** The link to copy by hand, under its press: focused and selected as it shows. */
function ByHand({ link, popover }: { link: string; popover: Popover }) {
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    field.current?.focus({ preventScroll: true })
    field.current?.select()
  }, [link])
  return (
    <div
      ref={popover.panel}
      className="copy-link-hand"
      role="group"
      aria-label="Copy this link"
      onKeyDown={popover.onKeyDown}
    >
      Copy this link:
      <input ref={field} readOnly value={link} aria-label="Link" />
    </div>
  )
}
