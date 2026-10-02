// The open sheet's address, to share "look at this": copied and said so for a moment, or, when the browser refuses,
// said too, with where to find it instead.
import { Icon, Tip } from '@sophia/ui'
import { useCopy } from './copy.ts'

const LABEL = { idle: 'Copy link', copied: 'Link copied', failed: 'Couldn’t copy: the link is in the address bar' }

export function CopyLink() {
  const { state, copy } = useCopy(() => window.location.href)
  return (
    <button type="button" className="round has-tip" data-copy={state} aria-label={LABEL[state]} onClick={copy}>
      <Icon name="link" />
      <Tip label={LABEL[state]} side="bottom" align="end" />
    </button>
  )
}
