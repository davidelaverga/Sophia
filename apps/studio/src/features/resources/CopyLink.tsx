// The open sheet's address, to share "look at this": copied and said so for a moment, or, when the browser refuses,
// said too, with where to find it instead. A sheet that doesn't write its anchor to the address bar gives its own
// address (work-copy-links.md); otherwise it is the address bar's.
import { Icon, Tip } from '@sophia/ui'
import { useCopy } from './copy.ts'

const LABEL = { idle: 'Copy link', copied: 'Link copied', failed: 'Couldn’t copy: the link is in the address bar' }

/** The address shown, or one given (a conversation's own, conversation-moves.md, even before the address names it). */
export function CopyLink({ href }: { href?: () => string }) {
  const { state, copy } = useCopy(href ?? (() => window.location.href))
  return (
    <button type="button" className="round has-tip" data-copy={state} aria-label={LABEL[state]} onClick={copy}>
      <Icon name="link" />
      <Tip label={LABEL[state]} side="bottom" align="end" />
    </button>
  )
}
