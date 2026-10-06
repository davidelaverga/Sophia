// Several conversations, one project (docs/plans/project-conversations.md, Davide's chapter 2): the project's text
// conversations, newest activity first, each with its own history; the one open beside them; and the project's
// context, the same for all of them. Members start one (New conversation) and continue one; viewers read
// (docs/plans/project-conversation-writes.md). Under the vision flag, where the fixture pages answer (A18, proposed).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { Membership } from '@sophia/contracts'
import {
  listConversations,
  type ConversationAsk,
  type ConversationStarted,
  type ConversationSummary,
  type MessageAsk,
} from '../../api/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { Waiting } from '../../app/Waiting.tsx'
import { byActivity, contributorsLine, listKey, matching, messagesKey, openWords } from './conversation-list.ts'
import type { Held } from './held-write.ts'
import { NewConversation } from './NewConversation.tsx'
import { OpenConversation } from './OpenConversation.tsx'
import { ProjectContext } from './ProjectContext.tsx'
import { NO_WORDS, START, useKept, withEntry } from './talk-store.ts'
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
  // Unknown until the membership is read: neither a field nor the viewer's line meanwhile.
  const writer = membership && membership.role !== 'viewer'
  const list = useQuery({
    queryKey: listKey(projectId, identity.name),
    queryFn: ({ signal }) => listConversations(identity.token, projectId, signal),
    select: sorted,
    retry: 1,
  })
  useReadAgain(cursor, list.refetch)
  const all = list.data ?? []
  const { open, choose } = useChosen(all)
  const talk = useTalk(projectId, identity.name)
  const start = useStart(projectId, identity, talk, choose)
  return (
    <section className="conversations" aria-labelledby="conversations-title">
      <h2 id="conversations-title">Conversations</h2>
      <div className="conversations-grid">
        <section className="conv-list" aria-label="All conversations">
          {writer && (
            <button
              ref={start.button}
              type="button"
              className="pill conv-start"
              aria-pressed={start.starting}
              onClick={start.toggle}
            >
              New conversation
            </button>
          )}
          <ListState read={list} count={all.length} />
          {all.length > 0 && (
            <Rows
              all={all}
              openId={start.starting ? undefined : open?.id}
              me={me}
              onOpen={(id) => {
                start.close()
                choose(id)
              }}
            />
          )}
        </section>
        {start.starting ? (
          <NewConversation projectId={projectId} identity={identity} {...start.form} />
        ) : (
          open && <Open conversation={open} {...{ identity, me, cursor, writer, talk, start }} />
        )}
        <ProjectContext projectId={projectId} identity={identity} cursor={cursor} />
      </div>
    </section>
  )
}

/** The open conversation, with what is under way in it kept by the view (talk-store.ts). */
function Open(props: {
  conversation: ConversationSummary
  identity: Identity
  me: string
  cursor: string | undefined
  writer: boolean | undefined
  talk: ReturnType<typeof useTalk>
  start: ReturnType<typeof useStart>
}) {
  const { conversation: c, talk, start } = props
  return (
    <OpenConversation
      key={c.id}
      conversation={c}
      identity={props.identity}
      me={props.me}
      cursor={props.cursor}
      writer={props.writer}
      {...talk.of(c.id)}
      arrived={start.arrived === c.id}
      onArrived={start.clearArrived}
    />
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

/**
 * What is under way in each conversation, kept per project and account (talk-store.ts): its draft, its message on its
 * way or sent with no reply, the refusal that answered it, and since when Sophia was asked there.
 */
function useTalk(projectId: string, name: string) {
  const { kept, change } = useKept(projectId, name)
  const of = (id: string) => ({
    draft: kept.drafts[id] ?? '',
    onDraft: (text: string) => change((k) => ({ ...k, drafts: withEntry(k.drafts, id, text) })),
    /** Clears a draft only if it still holds what was sent: words written since stay. */
    onClearIf: (text: string) =>
      change((k) => ((k.drafts[id] ?? '').trim() === text.trim() ? { ...k, drafts: withEntry(k.drafts, id, '') } : k)),
    held: kept.holds[id] ?? null,
    onHeld: (next: Held<MessageAsk> | null) => change((k) => ({ ...k, holds: withEntry(k.holds, id, next) })),
    refused: kept.refusals[id] ?? null,
    onRefused: (words: string | null) => change((k) => ({ ...k, refusals: withEntry(k.refusals, id, words) })),
    asked: kept.asked[id] ?? null,
    onAsked: (since: string) => change((k) => ({ ...k, asked: withEntry(k.asked, id, since) })),
  })
  return { of, kept, change }
}

/** Where the focus goes as the form goes: back to New conversation when put away, not when a row is pressed. */
function useFocusBack(starting: boolean) {
  const button = useRef<HTMLButtonElement>(null)
  const back = useRef(false)
  useEffect(() => {
    if (starting || !back.current) return
    back.current = false
    button.current?.focus()
  }, [starting])
  return { button, back }
}

/**
 * New conversation: its form in place of the open one, its words, intent and refusal kept with the rest (they wait
 * while it is away). Started, the conversation is put in the list and its messages at once (then read again); it opens
 * only if the person is still on the form: one who moved on meanwhile is never pulled into it.
 */
function useStart(projectId: string, identity: Identity, talk: ReturnType<typeof useTalk>, open: (id: string) => void) {
  const queryClient = useQueryClient()
  const [starting, setStarting] = useState(false)
  const onForm = useRef(false)
  onForm.current = starting
  const [arrived, setArrived] = useState<string | null>(null)
  const clearArrived = useCallback(() => setArrived(null), [])
  const { button, back } = useFocusBack(starting)
  const { kept, change } = talk
  const started = ({ conversation, message }: ConversationStarted, ask: ConversationAsk) => {
    const key = listKey(projectId, identity.name)
    queryClient.setQueryData<{ conversations: readonly ConversationSummary[] }>(key, (was) => ({
      conversations: [conversation, ...(was?.conversations ?? []).filter((c) => c.id !== conversation.id)],
    }))
    queryClient.setQueryData(messagesKey(conversation.id, identity.name), {
      pages: [{ messages: [message], before: null }],
      pageParams: [null],
    })
    void queryClient.invalidateQueries({ queryKey: key })
    change((k) => ({
      ...k,
      start: { ...k.start, fields: NO_WORDS },
      asked: ask.askSophia ? withEntry(k.asked, conversation.id, message.at) : k.asked,
    }))
    if (!onForm.current) return
    open(conversation.id)
    setArrived(conversation.id)
    setStarting(false)
  }
  const cancel = () => {
    back.current = true
    setStarting(false)
  }
  const form = {
    fields: kept.start.fields,
    onFields: (fields: ConversationAsk) => change((k) => ({ ...k, start: { ...k.start, fields } })),
    held: kept.start.held,
    onHeld: (held: Held<ConversationAsk> | null) => change((k) => ({ ...k, start: { ...k.start, held } })),
    refused: kept.refusals[START] ?? null,
    onRefused: (words: string | null) => change((k) => ({ ...k, refusals: withEntry(k.refusals, START, words) })),
    onStarted: started,
    onCancel: cancel,
  }
  return {
    starting,
    arrived,
    clearArrived,
    button,
    toggle: () => (starting ? cancel() : setStarting(true)),
    close: () => setStarting(false),
    form,
  }
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
