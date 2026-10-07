// Several conversations, one project (docs/plans/project-conversations.md, Davide's chapter 2): the project's text
// conversations, newest activity first, each with its own history; the one open beside them; and the project's
// context, the same for all of them. Members start one (New conversation) and continue one; viewers read
// (docs/plans/project-conversation-writes.md). Under the vision flag, where the fixture pages answer (A18, proposed).
// In three panes (docs/plans/conversations-panes.md): the list, the open one, its context. Under 1180 px the context is
// a panel «Context» opens; on a phone one screen shows at a time, the list or the conversation.
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

/** Who reads here: their id, and whether they write (unknown until the membership is read: neither, meanwhile). */
const readerOf = (membership: Membership | undefined) => ({
  me: membership?.actorId ?? '',
  writer: membership && membership.role !== 'viewer',
})

/** The project's conversations, newest activity first, read again as the feed moves. */
function useList(projectId: string, identity: Identity, cursor: string | undefined) {
  const list = useQuery({
    queryKey: listKey(projectId, identity.name),
    queryFn: ({ signal }) => listConversations(identity.token, projectId, signal),
    select: sorted,
    retry: 1,
  })
  useReadAgain(cursor, list.refetch)
  return { list, all: list.data ?? [] }
}

export function ConversationsView({ projectId, identity, membership, cursor }: Props) {
  const { me, writer } = readerOf(membership)
  const { list, all } = useList(projectId, identity, cursor)
  const { open, choose } = useChosen(all)
  const panes = usePanes()
  const talk = useTalk(projectId, identity.name)
  const start = useStart(projectId, identity, talk, (id) => {
    choose(id)
    panes.show()
  })
  // The one open, unless the form for a new one is in its place.
  const shown = start.starting ? undefined : open
  return (
    <section
      ref={panes.view}
      className="conversations"
      data-screen={start.starting ? 'thread' : panes.screen}
      data-context={panes.context || undefined}
      aria-labelledby="conversations-title"
    >
      <ListPane
        read={list}
        all={all}
        openId={shown?.id}
        me={me}
        start={writer ? start : null}
        onOpen={(id) => {
          start.close()
          choose(id)
          panes.show()
        }}
      />
      {start.starting && <NewConversation projectId={projectId} identity={identity} {...start.form} />}
      {shown && <Open conversation={shown} {...{ identity, me, cursor, writer, talk, start, panes }} />}
      <ProjectContext
        {...{ projectId, identity, cursor }}
        conversation={shown}
        opened={panes.context}
        onClose={panes.closeContext}
      />
      {panes.context && <div className="conv-scrim" aria-hidden onClick={panes.closeContext} />}
    </section>
  )
}

/** The left pane: the list's name and New conversation (for members), the list's state, and its rows. */
function ListPane(props: {
  read: Parameters<typeof ListState>[0]['read']
  all: readonly ConversationSummary[]
  openId: string | undefined
  me: string
  start: ReturnType<typeof useStart> | null
  onOpen: (id: string) => void
}) {
  const { all } = props
  return (
    <section className="conv-list" aria-label="All conversations">
      <div className="conv-list-head">
        <h2 id="conversations-title">Conversations</h2>
        {props.start && <StartButton start={props.start} />}
      </div>
      <ListState read={props.read} count={all.length} />
      {all.length > 0 && <Rows all={all} openId={props.openId} me={props.me} onOpen={props.onOpen} />}
    </section>
  )
}

/** New conversation: a + press beside the list's name, its words in its name and its tip. */
function StartButton({ start }: { start: ReturnType<typeof useStart> }) {
  return (
    <button
      ref={start.button}
      type="button"
      className="icon-button conv-start"
      aria-label="New conversation"
      title="New conversation"
      aria-pressed={start.starting}
      onClick={start.toggle}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <path d="M7 1.5v11M1.5 7h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  )
}

/**
 * What the panes show where they can't all show: on a phone, the list or the conversation (back to the list puts the
 * focus on the row pressed); under 1180 px, whether the context is open (Esc, Close or a press outside closes it, and the
 * focus goes back to «Context»). Over those widths the panes all show, and these change nothing.
 */
function usePanes() {
  const view = useRef<HTMLElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const [screen, setScreen] = useState<'list' | 'thread'>('list')
  const [context, setContext] = useState(false)
  const closeContext = useCallback(() => {
    setContext(false)
    toggle.current?.focus()
  }, [])
  useEffect(() => {
    if (!context) return undefined
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeContext()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [context, closeContext])
  const back = () => {
    setContext(false)
    setScreen('list')
    // After the list shows again: the row of the conversation left.
    requestAnimationFrame(() => view.current?.querySelector<HTMLElement>('.conv-row[aria-pressed="true"]')?.focus())
  }
  return {
    view,
    toggle,
    screen,
    show: () => setScreen('thread'),
    back,
    context,
    toggleContext: () => setContext((on) => !on),
    closeContext,
  }
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
  panes: ReturnType<typeof usePanes>
}) {
  const { conversation: c, talk, start, panes } = props
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
      onBack={panes.back}
      context={{ open: panes.context, toggle: panes.toggleContext, ref: panes.toggle }}
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
    askSophia: kept.asks[id] ?? true,
    onAskSophia: (on: boolean) => change((k) => ({ ...k, asks: withEntry(k.asks, id, on) })),
    onDraft: (text: string) => change((k) => ({ ...k, drafts: withEntry(k.drafts, id, text) })),
    /** Clears a draft only if it still holds what was sent: words written since stay. */
    onClearIf: (text: string) =>
      change((k) => ((k.drafts[id] ?? '').trim() === text.trim() ? { ...k, drafts: withEntry(k.drafts, id, '') } : k)),
    held: kept.holds[id] ?? null,
    onHeld: (next: Held<MessageAsk> | null) => change((k) => ({ ...k, holds: withEntry(k.holds, id, next) })),
    refused: kept.refusals[id] ?? null,
    onRefused: (words: string | null) => change((k) => ({ ...k, refusals: withEntry(k.refusals, id, words) })),
    asked: kept.asked[id] ?? null,
    onAsked: (at: string) => change((k) => ({ ...k, asked: withEntry(k.asked, id, { at, here: Date.now() }) })),
    /** Her answer to the ask made at `at` seen: that wait goes (one asked since stays). */
    onAnswered: (at: string) =>
      change((k) => (k.asked[id]?.at === at ? { ...k, asked: withEntry(k.asked, id, null) } : k)),
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
  // Whether the person is on the form now, for a start that lands later (set after each commit, not while rendering).
  const onForm = useRef(false)
  useEffect(() => {
    onForm.current = starting
  }, [starting])
  const [arrived, setArrived] = useState<string | null>(null)
  const clearArrived = useCallback(() => setArrived(null), [])
  const { button, back } = useFocusBack(starting)
  const { kept, change } = talk
  // The form's state, noted at once as it opens or goes: a start that lands in between never reads it stale.
  const setForm = (shown: boolean) => {
    onForm.current = shown
    setStarting(shown)
  }
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
      asked: ask.askSophia ? withEntry(k.asked, conversation.id, { at: message.at, here: Date.now() }) : k.asked,
    }))
    if (!onForm.current) return
    open(conversation.id)
    setArrived(conversation.id)
    setForm(false)
  }
  const cancel = () => {
    back.current = true
    setForm(false)
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
    toggle: () => (starting ? cancel() : setForm(true)),
    close: () => setForm(false),
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
