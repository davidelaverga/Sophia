// Project views as real links: they can be opened in a new tab, and a plain click navigates in place.
// A thin line slides under the current view.
import { useSlidingThumb } from '@sophia/ui'
import { routePath, VIEWS, type View } from '../../app/route.ts'

const LABEL: Record<View, string> = {
  studio: 'Studio',
  goals: 'Goals',
  work: 'Work',
  knowledge: 'Knowledge',
  updates: 'Updates',
  resources: 'Resources',
}

interface Props {
  projectId: string
  view: View
  onShow: (view: View) => void
}

export function ViewNav({ projectId, view, onShow }: Props) {
  const thumb = useSlidingThumb<HTMLElement>(view)
  const follow = (event: React.MouseEvent, next: View) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onShow(next)
  }
  return (
    <nav ref={thumb} className="view-nav" aria-label="Project views">
      {VIEWS.map((v) => (
        <a
          key={v}
          href={routePath({ projectId, view: v })}
          data-thumb={v}
          aria-current={v === view ? 'page' : undefined}
          onClick={(e) => follow(e, v)}
        >
          {LABEL[v]}
        </a>
      ))}
    </nav>
  )
}
