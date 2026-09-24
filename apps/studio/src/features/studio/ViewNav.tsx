// Project views as real links: they can be opened in a new tab, and a plain click navigates in place.
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
  const follow = (event: React.MouseEvent, next: View) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onShow(next)
  }
  return (
    <nav className="view-nav" aria-label="Project views">
      {VIEWS.map((v) => (
        <a
          key={v}
          href={routePath({ projectId, view: v })}
          aria-current={v === view ? 'page' : undefined}
          onClick={(e) => follow(e, v)}
        >
          {LABEL[v]}
        </a>
      ))}
    </nav>
  )
}
