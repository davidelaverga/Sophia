// Connections, shown before anything connects (docs/plans/project-connections.md, Davide's chapter 7): what a member's
// own assistant could read from this project, and the exact update the team's channel would receive. No API grants an
// assistant access or reaches a channel yet, so nothing here connects or sends, and nothing offers to: each part opens
// what it would do, built from the project's records. Under the vision flag.
import { useId, useState } from 'react'
import type { Identity } from '../../app/dev-identity.ts'
import { Sheet } from '../../app/Sheet.tsx'
import { UpdateSheet } from './UpdateSheet.tsx'
import './connections.css'

interface Props {
  projectId: string
  identity: Identity
  /** The project's title, as the snapshot names it. */
  title: string
  /** The project's feed position: the update's source is read again as it moves. */
  cursor: string | undefined
}

export function Connections({ projectId, identity, title, cursor }: Props) {
  const headId = useId()
  const [open, setOpen] = useState<'access' | 'update' | null>(null)
  return (
    <section className="connections" aria-labelledby={headId}>
      <h3 id={headId}>Connections</h3>
      <p className="connections-lead">Your work can be reachable, without becoming public.</p>
      <div className="connections-parts">
        <article className="conn-card">
          <span className="eyebrow">From your own assistant</span>
          <p className="conn-ask">“What did we decide about our checks?”</p>
          <p className="conn-note">
            The current decisions and their recaps; no private notes, work controls or access.
          </p>
          <button type="button" className="ghost" onClick={() => setOpen('access')}>
            Review the read-only access
          </button>
        </article>
        <article className="conn-card">
          <span className="eyebrow">To the team’s Slack channel</span>
          <p className="conn-ask">Share a selected milestone, not every discussion.</p>
          <p className="conn-note">Built from the newest closed meeting’s recap; you choose its lines.</p>
          <button type="button" className="ghost" onClick={() => setOpen('update')}>
            Preview the update
          </button>
        </article>
      </div>
      {open === 'access' && <AccessSheet title={title} onClose={() => setOpen(null)} />}
      {open === 'update' && <UpdateSheet {...{ projectId, identity, title, cursor }} onClose={() => setOpen(null)} />}
    </section>
  )
}

/** What a grant to one assistant would allow, and what it never would; none can be made from here yet. */
const ACCESS: readonly (readonly [string, string])[] = [
  ['Allowed reads', 'Meeting recaps, the current brief, the project’s reports and project search'],
  ['Excluded', 'Personal notes, private conversations, credentials and work controls'],
  ['Policy', 'Current membership + source eligibility + outbound permission + a grant bound to one assistant'],
  ['Revocation', 'Stops future access. It can’t erase copies already received elsewhere.'],
]

function AccessSheet({ title, onClose }: { title: string; onClose: () => void }) {
  const id = useId()
  return (
    <Sheet id={id} title="A small window into the project" onClose={onClose}>
      <p className="sheet-lead">
        An assistant of yours could answer a question about the project from what it may read. It never becomes the
        project’s controller.
      </p>
      <dl className="grant">
        <div className="grant-row">
          <dt>Project</dt>
          <dd>{`${title} only`}</dd>
        </div>
        {ACCESS.map(([term, what]) => (
          <div key={term} className="grant-row">
            <dt>{term}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
      <p className="conn-note">No assistant is connected, and none can be connected from here yet.</p>
    </Sheet>
  )
}
