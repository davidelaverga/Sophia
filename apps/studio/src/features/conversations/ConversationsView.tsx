// Several conversations, one project (docs/plans/project-conversations.md, Davide's chapter 2): the project's text
// conversations, newest activity first, each with its own history; the one open beside them; and the project's
// context, the same for all of them. Reading only: starting and continuing one come with the writes. Under the vision
// flag, where the fixture pages answer (A18, proposed).
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Membership } from '@sophia/contracts'
import { listConversations, type ConversationSummary } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Waiting } from '../../app/Waiting.tsx'
import { byActivity, contributorsLine, matching, openWords } from './conversation-list.ts'
import { OpenConversation } from './OpenConversation.tsx'
import { ProjectContext } from './ProjectContext.tsx'
import './conversations.css'

interface Props {
  projectId: string
  identity: Identity
  membership: Membership | undefined
  /** The project's feed position: the context is read again as it moves. */
  cursor: string | undefined
}

export function ConversationsView({ projectId, identity, membership, cursor }: Props) {
  const me = membership?.actorId ?? ''
  const list = useQuery({
    queryKey: ['vision', 'conversations', projectId, identity.name],
    queryFn: ({ signal }) => listConversations(identity.token, projectId, signal),
    select: (answer) => byActivity(answer.conversations),
    retry: 1,
  })
  const [chosen, setChosen] = useState<string | null>(null)
  const all = list.data ?? []
  // The one chosen while it is listed; else the newest.
  const open = all.find((c) => c.id === chosen) ?? all[0]
  return (
    <section className="conversations" aria-labelledby="conversations-title">
      <h2 id="conversations-title">Conversations</h2>
      <div className="conversations-grid">
        <section className="conv-list" aria-label="All conversations">
          <Waiting words="Reading the conversations…" waiting={list.isPending} />
          {list.isError && (
            <p className="conv-note" role="alert">
              {all.length > 0 ? 'This may be out of date.' : 'The conversations can’t be read now.'}{' '}
              <button type="button" className="text-button" onClick={() => void list.refetch()}>
                Try again
              </button>
            </p>
          )}
          {list.isSuccess && all.length === 0 && <p className="conv-note">No conversations in this project yet.</p>}
          {all.length > 0 && <Rows all={all} openId={open?.id} me={me} onOpen={setChosen} />}
        </section>
        {open && <OpenConversation key={open.id} conversation={open} identity={identity} me={me} />}
        <ProjectContext projectId={projectId} identity={identity} cursor={cursor} />
      </div>
    </section>
  )
}

/** The rows, narrowed by the filter: each opens its conversation. */
function Rows(props: {
  all: readonly ConversationSummary[]
  openId: string | undefined
  me: string
  onOpen: (id: string) => void
}) {
  const [typed, setTyped] = useState('')
  const shown = matching(props.all, typed)
  return (
    <>
      <input
        type="search"
        className="conv-filter"
        aria-label="Filter conversations"
        placeholder="Filter by title"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
      />
      {shown.length === 0 ? (
        <p className="conv-note">{`No conversation’s title has «${typed.trim()}».`}</p>
      ) : (
        <ul className="conv-rows">
          {shown.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="conv-row"
                aria-pressed={c.id === props.openId}
                onClick={() => props.onOpen(c.id)}
              >
                <span className="conv-title">{c.title}</span>
                {c.summary && <span className="conv-gist">{c.summary}</span>}
                <span className="conv-who">{contributorsLine(c, props.me)}</span>
                <span className="conv-state">{openWords(c.openQuestions)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
