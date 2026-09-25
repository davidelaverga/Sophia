// Views whose records do not exist yet say what they will hold and which goal brings them. Nothing here
// looks actionable: a page that pretends to work is worse than an honest one.
import type { View } from '../../app/route.ts'

type PendingViewName = Extract<View, 'knowledge' | 'updates' | 'resources'>

const PENDING: Record<PendingViewName, { title: string; body: string }> = {
  knowledge: {
    title: 'Knowledge',
    body: 'Current decisions, imported sources and what Sophia understands about the project arrive with source imports (S1-08).',
  },
  updates: {
    title: 'Updates',
    body: 'A finite digest of what needs you, kept apart from routine changes, arrives with owner actions (S1-09). Routine progress is in the Work pulse.',
  },
  resources: {
    title: 'Resources',
    body: 'The three owner-operated engineering connections (Davide’s Codex and Claude, Luis’s Claude) arrive with S1-09.',
  },
}

export function PendingView({ view }: { view: PendingViewName }) {
  const pending = PENDING[view]
  return (
    <section className="coming pending" aria-labelledby="pending-title">
      <span className="eyebrow">Coming</span>
      <h2 id="pending-title">{pending.title}</h2>
      <p>{pending.body}</p>
    </section>
  )
}
