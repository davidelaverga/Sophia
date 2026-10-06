// Several conversations, one project (docs/plans/project-conversations.md, Davide's chapter 2): the project's text
// conversations, newest activity first, each with its own history; the one open beside them; and the project's
// context, the same for all of them. Members start one (New conversation) and continue one; viewers read
// (docs/plans/project-conversation-writes.md). Under the vision flag, where the fixture pages answer (A18, proposed).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import type { Membership } from '@sophia/contracts'
import { listConversations, type ConversationStarted, type ConversationSummary } from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Waiting } from '../../app/Waiting.tsx'
import { byActivity, contributorsLine, listKey, matching, messagesKey, openWords } from './conversation-list.ts'
import { NewConversation } from './NewConversation.tsx'
import { OpenConversation } from './OpenConversation.tsx'
import { ProjectContext } from './ProjectContext.tsx'
import { useReadAgain } from './useReadAgain.ts'
import './conversations.css'

/** Newest activity first: sorted once per answer. */
const sorted = (answer: { conversations: readonly ConversationSummary[] }) => byActivity(answer.conversations)

interface Props {
  projectId: string
  identity: Identity
  membership: Membership | undefined
  /** The project's feed position: the context is read again as it moves. */
  cursor: string | undefined
}

export function ConversationsView({ projectId, identity, membership, cursor }: Props) {
  const me = membership?.actorId ?? ''
  const canWrite = membership !== undefined && membership.role !== 'viewer'
  const list = useQuery({
    queryKey: listKey(projectId, identity.name),
    queryFn: ({ signal }) => listConversations(identity.token, projectId, signal),
    select: sorted,
    retry: 1,
  })
  useReadAgain(cursor, list.refetch)
  const all = list.data ?? []
  const { open, choose } = useChosen(all)
  const start = useStart(projectId, identity, choose)
  const drafts = useDrafts()
  return (
    <section className="conversations" aria-labelledby="conversations-title">
      <h2 id="conversations-title">Conversations</h2>
      <div className="conversations-grid">
        <section className="conv-list" aria-label="All conversations">
          {canWrite && (
            <button ref={start.button} type="button" className="pill conv-start" onClick={start.begin}>
              New conversation
            </button>
          )}
          <ListState read={list} count={all.length} />
          {all.length > 0 && <Rows all={all} openId={open?.id} me={me} onOpen={choose} />}
        </section>
        {start.starting ? (
          <NewConversation
            projectId={projectId}
            identity={identity}
            onStarted={start.started}
            onCancel={start.cancel}
          />
        ) : (
          open && (
            <OpenConversation
              key={open.id}
              conversation={open}
              identity={identity}
              me={me}
              cursor={cursor}
              canWrite={canWrite}
              draft={drafts.of(open.id)}
              onDraft={(text) => drafts.set(open.id, text)}
              arrived={start.arrived === open.id}
            />
          )
        )}
        <ProjectContext projectId={projectId} identity={identity} cursor={cursor} />
      </div>
    </section>
  )
}

/**
 * The open conversation: the newest at first, then kept, so one that moves to the top meanwhile never takes its place.
 * One that leaves the list gives its place to the newest, which is kept in turn.
 */
function useChosen(all: readonly ConversationSummary[]) {
  const [chosen, setChosen] = useState<string | null>(null)
  if (all[0] && !all.some((c) => c.id === chosen)) setChosen(all[0].id)
  return { open: all.find((c) => c.id === chosen) ?? all[0], choose: setChosen }
}

/** Each conversation's draft, kept while the view is open: opening another and coming back finds it. */
function useDrafts() {
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({})
  return {
    of: (id: string) => drafts[id] ?? '',
    set: (id: string, text: string) => setDrafts((was) => ({ ...was, [id]: text })),
  }
}

/**
 * New conversation: its form in place of the open one. Started, the conversation is put in the list and its messages
 * at once (then read again), and it opens; put away, the focus goes back to New conversation.
 */
function useStart(projectId: string, identity: Identity, open: (id: string) => void) {
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)
  const [arrived, setArrived] = useState<string | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const back = useRef(false)
  useEffect(() => {
    if (starting || !back.current) return
    back.current = false
    button.current?.focus()
  }, [starting])
  const started = ({ conversation, message }: ConversationStarted) => {
    const key = listKey(projectId, identity.name)
    queryClient.setQueryData<{ conversations: readonly ConversationSummary[] }>(key, (was) => ({
      conversations: [conversation, ...(was?.conversations ?? []).filter((c) => c.id !== conversation.id)],
    }))
    queryClient.setQueryData(messagesKey(conversation.id, identity.name), {
      pages: [{ messages: [message], before: null }],
      pageParams: [null],
    })
    void queryClient.invalidateQueries({ queryKey: key })
    open(conversation.id)
    setArrived(conversation.id)
    setStarting(false)
  }
  const cancel = () => {
    back.current = true
    setStarting(false)
  }
  return { starting, arrived, button, begin: () => setStarting(true), started, cancel }
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
            <Row key={c.id} conversation={c} open={c.id === props.openId} me={props.me} onOpen={props.onOpen} />
          ))}
        </ul>
      )}
    </>
  )
}

/** A conversation as listed: named by its title, described by the rest. */
function Row(props: { conversation: ConversationSummary; open: boolean; me: string; onOpen: (id: string) => void }) {
  const { conversation: c } = props
  const id = useId()
  return (
    <li>
      <button
        type="button"
        className="conv-row"
        aria-pressed={props.open}
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-d`}
        onClick={() => props.onOpen(c.id)}
      >
        <span id={`${id}-t`} className="conv-title">
          {c.title}
        </span>
        <span id={`${id}-d`} className="conv-about">
          {c.summary && <span className="conv-gist">{c.summary}</span>}
          <span className="conv-who">{contributorsLine(c, props.me)}</span>
          <span className="conv-state">{openWords(c.openQuestions)}</span>
        </span>
      </button>
    </li>
  )
}

/** What the list's read says: waiting, failed (out of date when some were read), or none yet. */
function ListState(props: {
  read: { isPending: boolean; isError: boolean; isSuccess: boolean; refetch: () => Promise<unknown> }
  count: number
}) {
  const { read, count } = props
  return (
    <>
      <Waiting words="Reading the conversations…" waiting={read.isPending} />
      {read.isError && (
        <p className="conv-note" role="alert">
          {count > 0 ? 'This may be out of date.' : 'The conversations can’t be read now.'}{' '}
          <button type="button" className="text-button" onClick={() => void read.refetch()}>
            Try again
          </button>
        </p>
      )}
      {read.isSuccess && count === 0 && <p className="conv-note">No conversations in this project yet.</p>}
    </>
  )
}
