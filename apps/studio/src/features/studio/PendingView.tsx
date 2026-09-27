// Views whose records do not exist yet say what they will hold, in the user's words (the goal that brings
// each one is noted beside it, for us). Nothing here pretends to work; where a view's job is already done
// elsewhere, it leads there.
import type { View } from '../../app/route.ts'

type PendingViewName = Extract<View, 'knowledge' | 'updates' | 'resources'>

interface Pending {
  title: string
  body: string
  /** Where the same need is met today. */
  leadsTo?: { label: string; view: View }
}

const PENDING: Record<PendingViewName, Pending> = {
  // S1-08, source imports.
  knowledge: {
    title: 'Knowledge',
    body: 'Current decisions, imported sources and what Sophia understands about the project will live here.',
  },
  // S1-09, owner actions.
  updates: {
    title: 'Updates',
    body: 'A short digest of what needs you, kept apart from routine changes, will live here. Routine progress is already in the Work pulse.',
    leadsTo: { label: 'Open Work', view: 'work' },
  },
  // S1-09, owner-operated connections.
  resources: {
    title: 'Resources',
    body: 'The engineering connections the owners run (Davide’s Codex and Claude, Luis’s Claude) will be listed here.',
  },
}

export function PendingView({ view, onShow }: { view: PendingViewName; onShow: (view: View) => void }) {
  const { title, body, leadsTo } = PENDING[view]
  return (
    <section className="coming pending" aria-labelledby="pending-title">
      <span className="eyebrow">Coming</span>
      <h2 id="pending-title">{title}</h2>
      <p>{body}</p>
      {leadsTo && (
        <button type="button" className="pill" onClick={() => onShow(leadsTo.view)}>
          {leadsTo.label}
        </button>
      )}
    </section>
  )
}
