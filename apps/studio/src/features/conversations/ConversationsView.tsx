// Several conversations, one project (docs/plans/project-conversations.md, Davide's chapter 2): the project's text
// conversations, newest activity first, each with its own history; the one open beside them; and the project's
// context, the same for all of them. Members start one (New conversation) and continue one; viewers read
// (docs/plans/project-conversation-writes.md). The API's A16 (CON-01) answers, or the fixture pages with its shapes;
// the list says what this reader may do there now (`capability`), and every write is checked again when made.
// In three panes (docs/plans/conversations-panes.md): the list, the open one, its context. Under 1180 px the context is
// a panel «Context» opens; on a phone one screen shows at a time, the list or the conversation.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type { Membership } from '@sophia/contracts'
import {
  getConversationMessages,
  listConversations,
  type ConversationAsk,
  type ConversationList,
  type ConversationReply,
  type ConversationStarted,
  type ConversationSummary,
  type MessageAsk,
} from '../../api/conversations.ts'
import { ApiError } from '../../api/client.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { modalOnScreen } from '../../app/shortcuts.ts'
import { Waiting } from '../../app/Waiting.tsx'
import { byActivity, listKey, messagesKey, newestWords, type ThreadHeld } from './conversation-list.ts'
import { Rows } from './ConversationRows.tsx'
import type { Held } from './held-write.ts'
import { NewConversation } from './NewConversation.tsx'
import { ContextToggle, OpenConversation } from './OpenConversation.tsx'
import { ProjectContext } from './ProjectContext.tsx'
import type { Erase } from './EraseHere.tsx'
import {
  goneFrom,
  keepsFor,
  fenceLifts,
  liftFence,
  START,
  awaiting,
  useKept,
  withEntry,
  withErasure,
  withFence,
  withListed,
  withStanding,
  withoutConversation,
  type Kept,
} from './talk-store.ts'
import { useReadAgain } from './useReadAgain.ts'
import { landed, newestRead, putStarted, releasable, shownList, startHeld } from './list-data.ts'
import { keepWithdrawnPurged, listReadSetsOut, orderNow, type ListRead } from './withdrawn-purge.ts'
import { Probes } from './probes.ts'
import { useArrival } from '../studio/project-go.tsx'
import './conversations.css'

/** Newest activity first, sorted once per answer, with what the reader may do there. */
const sorted = (answer: ListRead) => ({
  all: byActivity(answer.conversations),
  // Where in this view's order the read set out (withdrawn-purge.ts): none noted, before everything.
  readFrom: answer.readFrom ?? 0,
  // The API lists the newest only, and says so (`more`): older ones exist that this list can't open.
  more: answer.more,
  capability: answer.capability,
  notice: answer.policy?.notice ?? null,
})

interface Props {
  projectId: string
  identity: Identity
  membership: Membership | undefined
  /** The project's feed position: the context is read again as it moves. */
  cursor: string | undefined
}

/** Which pane a phone shows: the form or the open conversation where either is, else the list. */
const screenOf = (open: boolean, starting: boolean, screen: 'list' | 'thread') =>
  starting ? 'thread' : open ? screen : 'list'

/**
 * Who reads here: their id, and whether they write. Unknown until both the membership and the list are read (neither,
 * meanwhile): a member writes only where the project's conversations are on (`capability.write`).
 */
const readerOf = (membership: Membership | undefined, write: boolean | undefined) => ({
  me: membership?.actorId ?? '',
  writer: membership && write !== undefined ? membership.role !== 'viewer' && write : undefined,
})

/** The project's conversations, newest activity first, read again as the feed moves. */
function useList(projectId: string, identity: Identity, cursor: string | undefined) {
  const list = useQuery({
    queryKey: listKey(projectId, accountOf(identity)),
    // Where in this view's order the read set out: a withdrawal seen after it may be one it didn't know.
    queryFn: ({ signal }) => {
      const readFrom = listReadSetsOut()
      return listConversations(identity.token, projectId, signal).then((answer) => ({ ...answer, readFrom }))
    },
    select: sorted,
    retry: 1,
  })
  useReadAgain(cursor, list.refetch)
  // What a thread read here learns withdrawn leaves the list reads as cached, for as long as the cache lives.
  const queryClient = useQueryClient()
  useEffect(() => {
    keepWithdrawnPurged(queryClient.getQueryCache())
  }, [queryClient])
  // Read, and not being read again: what it holds is the list as it is now.
  return {
    list,
    all: list.data?.all ?? [],
    more: list.data?.more === true,
    capability: list.data?.capability,
    notice: list.data?.notice ?? null,
    readFrom: list.data?.readFrom ?? 0,
    settled: list.isSuccess && !list.isFetching,
    /** Read, as it is now, and holding every conversation (no `more`): one missing from it is gone. */
    whole: list.isSuccess && !list.isFetching && !list.data.more,
  }
}

/**
 * The list as read, and what this reader may do with it: who they are, whether they write, what Sophia answers here,
 * and the saved-text notice (before their first message in the project; after it, in the context's help).
 */
function useReader(projectId: string, identity: Identity, membership: Membership | undefined, cursor?: string) {
  const read = useList(projectId, identity, cursor)
  const { capability, notice, all } = read
  const { me, writer } = readerOf(membership, capability?.write)
  const wrote = all.some((c) => c.contributors.some((p) => p.actorId === me))
  return {
    ...read,
    me,
    writer,
    firstNotice: wrote ? null : notice,
    answers: capability?.ask === 'available',
    moderate: capability?.moderate === true,
  }
}

/**
 * What this view keeps for the project and account (useTalk), and the list as shown with it: as read, with a start that
 * landed here held back and that a list of the newest only leaves out (list-data `shownList`). Fenced (talk-store
 * `fence`: an open conversation's read answered not found, and no list read set out since has answered), none at all:
 * no row, and so no thread or summary, cached or not, until one does, which lifts it (PR #199 r4238709217).
 */
function useShown(
  projectId: string,
  identity: Identity,
  reader: { all: readonly ConversationSummary[]; more: boolean; readFrom: number },
) {
  const talk = useTalk(projectId, accountOf(identity))
  const fenced = talk.kept.fence !== null && !fenceLifts(talk.kept, reader.readFrom)
  return { talk, fenced, all: fenced ? NONE : shownList(reader.all, talk.kept, reader.more) }
}

/** No conversation shown (fenced). */
const NONE: readonly ConversationSummary[] = []

export function ConversationsView({ projectId, identity, membership, cursor }: Props) {
  const reader = useReader(projectId, identity, membership, cursor)
  const { talk, all, fenced } = useShown(projectId, identity, reader)
  const { list, capability, notice, settled, me, writer } = reader
  const { open, choose, ask, missing } = useChosen(all, settled)
  const panes = usePanes()
  // One asked for from elsewhere (a report's source, project-go.tsx): open, and shown on a phone too.
  useArrival('conversations', (to) => {
    ask(to.conversationId)
    panes.show()
  })
  const erased = useErased(talk, panes, { ...reader, seen: list.isSuccess }, identity)
  const feedAt = useLatest(cursor)
  const start = useStart(projectId, identity, feedAt, talk, (id) => {
    erased.clear()
    choose(id)
    panes.show()
  })
  useStanding(projectId, identity, talk, reader, start.land)
  // The one open, unless the form for a new one is in its place.
  const shown = start.starting ? undefined : open
  return (
    <section
      ref={panes.view}
      className="conversations"
      data-screen={screenOf(Boolean(shown), start.starting, panes.screen)}
      data-context={panes.context || undefined}
      aria-labelledby="conversations-title"
    >
      <ListPane
        projectId={projectId}
        reader={accountOf(identity)}
        read={list}
        all={all}
        openId={shown?.id}
        me={me}
        missing={missing}
        more={newestRead(reader)}
        erased={erased.said}
        {...{ capability, fenced }}
        start={writer ? start : null}
        // With no conversation open (none yet, or the form for a new one), «Context» is the list's.
        context={shown ? null : { open: panes.context, toggle: panes.toggleContext, ref: panes.toggle }}
        onOpen={(id) => {
          start.close()
          erased.clear()
          choose(id)
          panes.show()
        }}
      />
      <Middle shown={shown} {...{ projectId, identity, cursor, reader, talk, start, panes }} />
      <ProjectContext
        {...{ projectId, identity, cursor }}
        conversation={shown}
        notice={notice}
        erase={reader.moderate ? eraseOf(projectId, identity, erased, talk) : null}
        opened={panes.context}
        onClose={panes.closeContext}
      />
      {panes.context && <div className="conv-scrim" aria-hidden onClick={panes.closeContext} />}
    </section>
  )
}

/** The middle pane: the form for a new conversation, or the one open. */
function Middle(props: {
  shown: ConversationSummary | undefined
  projectId: string
  identity: Identity
  cursor: string | undefined
  reader: ReturnType<typeof useReader>
  talk: ReturnType<typeof useTalk>
  start: ReturnType<typeof useStart>
  panes: ReturnType<typeof usePanes>
}) {
  const { shown, projectId, identity, cursor, reader, talk, start, panes } = props
  if (start.starting) {
    return <NewConversation projectId={projectId} identity={identity} notice={reader.firstNotice} {...start.form} />
  }
  if (!shown) return null
  return (
    <Open
      conversation={shown}
      answers={reader.answers}
      moderate={reader.moderate}
      notice={reader.firstNotice}
      me={reader.me}
      writer={reader.writer}
      {...{ projectId, identity, cursor, talk, start, panes }}
    />
  )
}

/** What the list pane shows (ListPane). */
interface ListProps {
  projectId: string
  /** Who reads, known at once (the membership, and so `me`, may come later). */
  reader: string
  read: Parameters<typeof ListState>[0]['read']
  all: readonly ConversationSummary[]
  openId: string | undefined
  me: string
  /** One asked for from elsewhere that the list, read again, doesn't hold. */
  missing: boolean
  /**
   * The list holds the newest only (A16's `more`), this many as read (a start landed here and shown with them is not
   * one of them: list-data `shownList`, said besides them): older conversations exist that it doesn't list. Null: it
   * holds them all.
   */
  more: number | null
  /** The one open was just erased here (the newest is open now). */
  erased: boolean
  /** No conversation shown until a list read answers (talk-store `fence`; `all` is then empty). */
  fenced: boolean
  /** What the reader may do here now, as the list says it (advisory: each write is checked again). */
  capability: ConversationList['capability'] | undefined
  start: ReturnType<typeof useStart> | null
  context: Parameters<typeof ContextToggle>[0]['context'] | null
  onOpen: (id: string) => void
}

/** The left pane: the list's name and New conversation (for members), the list's state, and its rows. */
function ListPane(props: ListProps) {
  return (
    <section className="conv-list" aria-label="All conversations">
      <div className="conv-list-head">
        <h2 id="conversations-title">Conversations</h2>
        <div className="conv-list-acts">
          {props.context && <ContextToggle context={props.context} />}
          {props.start && <StartButton start={props.start} />}
        </div>
      </div>
      <ListState read={props.read} count={props.fenced ? null : props.all.length} capability={props.capability} />
      {props.fenced ? (
        <p className="conv-note" role="status">
          A conversation here can’t be found any more. None is shown until this project’s conversations can be read
          again.
        </p>
      ) : (
        <Listed {...props} />
      )}
    </section>
  )
}

/** The list as read: what it says of itself, then its rows. */
function Listed(props: ListProps) {
  const { all } = props
  return (
    <>
      {props.missing && (
        <p className="conv-note" role="status">
          {props.more !== null
            ? 'The conversation asked for isn’t among those listed here (it may be older): the newest is open.'
            : 'The conversation asked for isn’t here: the newest is open.'}
        </p>
      )}
      {props.more !== null && <p className="conv-note">{newestWords(props.more, all.length - props.more)}</p>}
      {props.erased && (
        <p className="conv-note" role="status">
          The conversation was erased.
        </p>
      )}
      {all.length > 0 && (
        <Rows
          {...{ all, me: props.me, reader: props.reader }}
          projectId={props.projectId}
          openId={props.openId}
          onOpen={props.onOpen}
        />
      )}
    </>
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
  // A phone opens on the list; a wider screen on the conversation, which stays when a report beside it leaves room for
  // one pane only.
  const [screen, setScreen] = useState<'list' | 'thread'>(() =>
    window.matchMedia('(max-width: 720px)').matches ? 'list' : 'thread',
  )
  const [context, setContext] = useState(false)
  const closeContext = useCallback(() => {
    setContext(false)
    // Once what was behind it is no longer inert: then «Context» can take the focus.
    requestAnimationFrame(() => toggle.current?.focus())
  }, [])
  const dropContext = useCallback(() => setContext(false), [])
  useContextPanel(view, context, closeContext, dropContext)
  const show = () => {
    const from = document.activeElement
    setScreen('thread')
    // Shown now (a phone kept it hidden): it opens at its newest message.
    requestAnimationFrame(() => {
      const thread = view.current?.querySelector('.conv-scroll')
      if (thread) thread.scrollTop = thread.scrollHeight
      // Pressed from the list a phone now hides (the row with it): the focus goes to the conversation's title, never
      // to the page. Where the list stays in sight, the row keeps it.
      const pressed = from instanceof HTMLElement && from.closest('.conv-list') ? from : null
      if (pressed && (document.activeElement === document.body || !pressed.checkVisibility())) {
        view.current?.querySelector<HTMLElement>('.conv-head h3')?.focus({ preventScroll: true })
      }
    })
  }
  const toList = useCallback(() => {
    setContext(false)
    setScreen('list')
  }, [])
  const back = () => {
    toList()
    // After the list shows again: the row of the conversation left, else the filter (that row may be filtered out).
    requestAnimationFrame(() => {
      const at = view.current?.querySelector<HTMLElement>('.conv-row[aria-pressed="true"]')
      ;(at ?? view.current?.querySelector<HTMLElement>('.conv-filter, .conv-start'))?.focus()
    })
  }
  return {
    view,
    toggle,
    screen,
    show,
    back,
    toList,
    context,
    toggleContext: () => setContext((on) => !on),
    closeContext,
  }
}

/** Over 1180 px of the view (not of the window: a report beside it narrows it) the context is a pane, not a panel. */
const PANEL = 1180

/**
 * The context as a panel, while it is open: Esc closes it (unless a dialog or another view's key owns the Esc), the
 * list and the conversation behind it are inert, and the room's dock under it (the focus stays in it), and the view
 * grown past a panel's width closes it.
 */
function useContextPanel(view: RefObject<HTMLElement | null>, open: boolean, close: () => void, drop: () => void) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null
      if (e.key !== 'Escape' || e.defaultPrevented || modalOnScreen() || t?.closest('[role="dialog"]')) return
      close()
    }
    const behind = [
      ...(view.current?.querySelectorAll<HTMLElement>('.conv-list, .conv-open, .conv-new') ?? []),
      ...document.querySelectorAll<HTMLElement>('.mini-dock'),
    ]
    for (const el of behind) el.inert = true
    const width = new ResizeObserver(([entry]) => {
      if (!entry || entry.contentRect.width <= PANEL) return
      const at = document.activeElement
      const panel = document.getElementById('conv-context')
      const closer = panel?.querySelector('.conv-context-close')
      drop()
      // Its Close is gone with the panel: the context, a pane now, takes the focus that was on it. A control that
      // stays in sight keeps it.
      if (panel && (at === document.body || at === closer)) requestAnimationFrame(() => panel.focus())
    })
    if (view.current) width.observe(view.current)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      width.disconnect()
      for (const el of behind) el.inert = false
    }
  }, [view, open, close, drop])
}

/** The open conversation, with what is under way in it kept by the view (talk-store.ts). */
function Open(props: {
  projectId: string
  conversation: ConversationSummary
  identity: Identity
  me: string
  cursor: string | undefined
  writer: boolean | undefined
  answers: boolean
  moderate: boolean
  notice: string | null
  talk: ReturnType<typeof useTalk>
  start: ReturnType<typeof useStart>
  panes: ReturnType<typeof usePanes>
}) {
  const { conversation: c, talk, start, panes } = props
  const queryClient = useQueryClient()
  // Its own read answered not found: erased, or the reader no longer in the project. Fenced (talk-store `fence`): no
  // conversation shows, its own included, until a list read set out since answers; the list is read again now.
  const gone = () => {
    talk.change((k) => withFence(k, { at: orderNow(), id: c.id }))
    void queryClient.invalidateQueries({ queryKey: listKey(props.projectId, accountOf(props.identity)) })
  }
  return (
    <OpenConversation
      key={c.id}
      projectId={props.projectId}
      conversation={c}
      identity={props.identity}
      me={props.me}
      cursor={props.cursor}
      writer={props.writer}
      answers={props.answers}
      moderate={props.moderate}
      notice={props.notice}
      {...talk.of(c.id)}
      arrived={start.arrived === c.id}
      onArrived={start.clearArrived}
      onBack={panes.back}
      context={{ open: panes.context, toggle: panes.toggleContext, ref: panes.toggle }}
      onGone={gone}
    />
  )
}

/**
 * The open conversation: the newest at first, then kept, so one that moves to the top meanwhile never takes its place.
 * One that leaves the list gives its place to the newest, which is kept in turn. One chosen while the list is still
 * coming (asked for from elsewhere) waits for it.
 */
function useChosen(all: readonly ConversationSummary[], settled: boolean) {
  const [chosen, setChosen] = useState<string | null>(null)
  // One asked for from elsewhere (`ask`) waits for the list read again before the newest takes its place, and then
  // says it isn't there (`missing`) rather than opening another in silence.
  const [wanted, setWanted] = useState<string | null>(null)
  const held = all.some((c) => c.id === chosen)
  if (all[0] && !held && (wanted === null || settled)) setChosen(all[0].id)
  return {
    open: all.find((c) => c.id === chosen) ?? all[0],
    choose: (id: string) => {
      setWanted(null)
      setChosen(id)
    },
    ask: (id: string) => {
      setWanted(id)
      setChosen(id)
    },
    missing: wanted !== null && settled && !all.some((c) => c.id === wanted),
  }
}

/**
 * What is under way in each conversation, kept per project and account (talk-store.ts): its draft, its message on its
 * way or sent with no reply, the refusal that answered it, and since when Sophia was asked there.
 */
function useTalk(projectId: string, name: string) {
  const { kept, change, latest } = useKept(projectId, name)
  const of = (id: string) => ({
    /** Erased since (its reply, or a whole list without it): an answer that comes late keeps nothing of it. */
    gone: () => latest().erased[id] === true,
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
    onAsked: (reply: ConversationReply) =>
      change((k) => ({
        ...k,
        asked: withEntry(k.asked, id, { replyId: reply.id, messageId: reply.messageId, here: Date.now() }),
      })),
    /** The request `replyId` ended (answered, or said why not): that wait goes; one asked since stays. */
    onAnswered: (replyId: string) =>
      change((k) => (k.asked[id]?.replyId === replyId ? { ...k, asked: withEntry(k.asked, id, null) } : k)),
  })
  return { of, kept, change, latest }
}

/** Where an admin erases here: the view keeps each conversation's erasure intent, and settles it (useErased). */
function eraseOf(
  projectId: string,
  identity: Identity,
  erased: ReturnType<typeof useErased>,
  talk: ReturnType<typeof useTalk>,
): Erase {
  return {
    projectId,
    identity,
    arm: erased.arm,
    onErased: erased.on,
    held: (id) => talk.kept.erasures[id] ?? null,
    // Let go, in doubt from now in this view's order (talk-store `doubted`): a read set out later says.
    onHeld: (id, next) => talk.change((k) => withErasure(k, id, next, orderNow())),
  }
}

/**
 * A conversation erased here: what the view kept for it goes (its draft, its message held, its wait, its erasure), the
 * list shows again (a phone's one screen, the context put away), and the list says it was erased until another is
 * opened. The focus, armed as Erase is pressed, waits for the conversation to leave the list (its reply, the feed
 * first, or any read without it), then for the list to be in sight (on a phone it shows only then), and lands on the
 * row open now, unless the person moved it elsewhere meanwhile (focusLater; CX-0015). Only its reply, or a whole list
 * read without it (`whole`: read now, no `more`; useSeen), settles it: what was kept for it goes, and the list says it was
 * erased if the person is still where the erase left them. A list that failed, is still being read, or lists the
 * newest only proves nothing: one missing from it may be older, and its erasure stays held. A reply (or a feed) that
 * comes after they opened another conversation never moves them, their focus or their draft.
 */
function useErased(
  talk: ReturnType<typeof useTalk>,
  panes: ReturnType<typeof usePanes>,
  read: Listed,
  identity: Identity,
) {
  const { all } = read
  const account = accountOf(identity)
  const queryClient = useQueryClient()
  const [said, setSaid] = useState(false)
  const landing = useRef<{ id: string; land: (el: HTMLElement | null) => void } | null>(null)
  // Erased here, and the view not taken elsewhere since: its reply may say so.
  const saying = useRef<string | null>(null)
  // It left the list: now the list is to show, and the focus to land once it does.
  const [due, setDue] = useState(false)
  const { toList, view, screen, context } = panes
  const { change } = talk
  // Settled, by a whole list without it or by its reply, whichever first: what was kept for it goes, its messages as
  // read with it, and it is said, once.
  const settle = useCallback(
    (id: string) => {
      // The messages its thread was read with go too, before that read goes (PR #199 r4237298613).
      const thread = queryClient.getQueryData<ThreadHeld>(messagesKey(id, account))
      const ids = (thread?.pages ?? []).flatMap((p) => p.messages.map((m) => m.id))
      change((k) => withoutConversation(k, id, ids))
      queryClient.removeQueries({ queryKey: messagesKey(id, account) })
      if (saying.current !== id) return
      saying.current = null
      setSaid(true)
    },
    [change, queryClient, account],
  )
  // Out of the list as read, whatever the read: the list is where the focus goes (the newest is open in its place).
  useEffect(() => {
    const at = landing.current
    if (!at || due || all.some((c) => c.id === at.id)) return
    toList()
    setDue(true)
  }, [all, due, toList])
  useSeen(talk, read, settle, useProbes(identity, settle, talk))
  useLift(talk, read, settle)
  useEffect(() => {
    const at = landing.current
    if (!due || !at || screen !== 'list' || context) return
    landing.current = null
    setDue(false)
    at.land(
      view.current?.querySelector<HTMLElement>('.conv-row[aria-pressed="true"]') ??
        view.current?.querySelector<HTMLElement>('.conv-filter, .conv-start') ??
        null,
    )
  }, [due, screen, context, view])
  return {
    said,
    // Another conversation opened (or one started): the erase leaves them where they are now.
    clear: () => {
      landing.current = null
      saying.current = null
      setSaid(false)
    },
    arm: (id: string, land: (el: HTMLElement | null) => void) => {
      landing.current = { id, land }
      saying.current = id
    },
    on: settle,
  }
}

/** The list as read: its conversations, whether it was read, and whether whole (no `more`) and read now. */
interface Listed {
  all: readonly ConversationSummary[]
  seen: boolean
  whole: boolean
  /** Where in this view's order the read held set out (withdrawn-purge `listReadSetsOut`). */
  readFrom: number
}

/**
 * A fence (talk-store `fence`) lifts once a list read set out since answers: the reader is still in the project, so its
 * conversation, unless that read lists it, is erased, and settled as one (PR #199 r4238709217). A read refused, failing
 * or from before keeps it, and nothing is settled.
 */
function useLift(talk: ReturnType<typeof useTalk>, read: Listed, settle: (id: string) => void) {
  const { kept, change } = talk
  const { all, readFrom } = read
  useEffect(() => {
    const { fence } = kept
    if (!fence || !fenceLifts(kept, readFrom)) return
    change((k) => liftFence(k, readFrom))
    if (!all.some((c) => c.id === fence.id)) settle(fence.id)
  }, [kept, readFrom, all, change, settle])
}

/**
 * Every list read is seen. Out of a whole list read now, a conversation seen before is gone, erased here or by anyone
 * else (PR #199 r4235397313): an erasure held here settles, and whatever was kept for it, or read of it, goes with it.
 * A list of the newest only leaving one out proves nothing.
 */
function useSeen(talk: ReturnType<typeof useTalk>, read: Listed, settle: (id: string) => void, probes: Probes) {
  const { kept, change } = talk
  const { all, seen, whole } = read
  useEffect(() => {
    if (!seen) return
    const now = all.map((c) => c.id)
    for (const id of now) probes.stop(id)
    for (const id of goneFrom(kept, now)) {
      if (whole) settle(id)
      else probes.start(id)
    }
    if (withListed(kept, now, whole) !== kept) change((k) => withListed(k, now, whole))
  }, [seen, whole, all, kept, settle, probes, change])
}

/**
 * The conversations left out of a list of the newest only that something is kept for here, read directly (probes.ts):
 * the API's not found settles one; nothing else does. Every read stops with the view.
 */
function useProbes(
  identity: Identity,
  settle: (id: string) => void,
  talk: { latest: () => Kept; change: (f: (k: Kept) => Kept) => void },
): Probes {
  const queryClient = useQueryClient()
  const account = accountOf(identity)
  const { latest, change } = talk
  const probes = useMemo(
    () =>
      new Probes({
        // Answering, it says where in this view's order it set out: a doubt from before it ends (withStanding).
        read: (id, signal) => {
          const from = orderNow()
          return getConversationMessages(identity.token, id, null, signal).then(() => from)
        },
        keeps: (id) => keepsFor(latest(), id) || queryClient.getQueryData(messagesKey(id, account)) !== undefined,
        settle,
        found: (id, from) => {
          if (typeof from === 'number') change((k) => withStanding(k, [id], from))
        },
        notFound: (err) => err instanceof ApiError && err.code === 'not_found',
      }),
    [identity.token, settle, latest, change, queryClient, account],
  )
  // Opened with the view, closed as it goes: a remount (StrictMode's setup, cleanup, setup) leaves it open.
  useEffect(() => {
    probes.open()
    return () => probes.stopAll()
  }, [probes])
  return probes
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
 * A value as it is now, for what lands later (set after each commit, not while rendering): where this page's feed stands
 * as a start's receipt lands, which its first message must be current at to go into the thread (putStarted). The
 * receipt is stamped with its own position, never this one (PR #199 r4237924424).
 */
function useLatest<T>(value: T) {
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])
  return latest
}

/**
 * New conversation: its form in place of the open one, its words, intent and refusal kept with the rest (they wait
 * while it is away). Started, the conversation is put in the list and its messages at once (then read again); it opens
 * only if the person is still on the form: one who moved on meanwhile is never pulled into it.
 */
function useStart(
  projectId: string,
  identity: Identity,
  feedAt: { readonly current: string | undefined },
  talk: ReturnType<typeof useTalk>,
  open: (id: string) => void,
) {
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
  // A start that landed opens only for one still on the form: one who moved on meanwhile is never pulled into it.
  const arrive = (id: string) => {
    if (!onForm.current) return
    open(id)
    setArrived(id)
    setForm(false)
  }
  const { started, land } = useLanding(projectId, identity, feedAt, talk, arrive)
  const cancel = () => {
    back.current = true
    setForm(false)
  }
  const form = {
    fields: kept.start.fields,
    onFields: (fields: ConversationAsk) => change((k) => ({ ...k, start: { ...k.start, fields } })),
    held: startHeld(kept.start),
    onHeld: (held: Held<ConversationAsk> | null) => change((k) => ({ ...k, start: { ...k.start, held } })),
    refused: kept.start.heldBack ? HELD_BACK : (kept.refusals[START] ?? null),
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
    land,
  }
}

/**
 * A start's receipt landing: as it comes (`started`: listed, and its first message written where putStarted's gates
 * let it, unless list-data `landed` holds it back), or once held back and now free (`land`, list-data `releasable`):
 * kept reachable by its title only, its wait claimed only as a fresh read shows it (`landed`); the list read again.
 * Either is opened (`arrive`) only for one still on the form.
 */
function useLanding(
  projectId: string,
  identity: Identity,
  feedAt: { readonly current: string | undefined },
  talk: ReturnType<typeof useTalk>,
  arrive: (id: string) => void,
) {
  const queryClient = useQueryClient()
  const account = accountOf(identity)
  return {
    started: (receipt: ConversationStarted) => {
      const put = () => putStarted(queryClient, projectId, account, receipt, feedAt.current)
      if (landed(talk, receipt, put)) arrive(receipt.conversation.id)
    },
    land: (receipt: ConversationStarted, words: ConversationAsk) => {
      const put = () => void queryClient.invalidateQueries({ queryKey: listKey(projectId, account) })
      if (landed(talk, receipt, put, words)) arrive(receipt.conversation.id)
    },
  }
}

/**
 * The conversations in doubt here (talk-store `doubted`: an erasure let go without being known erased): a list read is
 * asked for, and each that a read set out since lists stands (`withStanding`; a direct read answering does the same:
 * useProbes). A whole list without one lets it go (useSeen). A start's receipt held back for one lands once it is free
 * (list-data `releasable`). Asked again as the doubt changes, and each time the view comes back while it lasts.
 */
function useStanding(
  projectId: string,
  identity: Identity,
  talk: ReturnType<typeof useTalk>,
  read: { all: readonly ConversationSummary[]; readFrom: number },
  land: ReturnType<typeof useStart>['land'],
) {
  const queryClient = useQueryClient()
  const { kept, change, latest } = talk
  const doubt = awaiting(kept).join(' ')
  useEffect(() => {
    if (doubt) void queryClient.invalidateQueries({ queryKey: listKey(projectId, accountOf(identity)) })
  }, [doubt, queryClient, projectId, identity])
  const { all, readFrom } = read
  useEffect(() => {
    if (!doubt) return
    const listed = all.map((c) => c.id)
    change((k) => withStanding(k, listed, readFrom))
  }, [doubt, all, readFrom, change])
  // Read as it is now, not as this render saw it: it lands once, whatever runs the effect again (StrictMode included).
  const free = releasable(kept) !== null
  useEffect(() => {
    const back = free ? releasable(latest()) : null
    if (back) land(back.receipt, back.fields)
  }, [free, land, latest])
}

/** What the form says while its start's receipt is held back for an erasure of that conversation pressed here. */
const HELD_BACK = 'Started, while you erase that conversation: it opens here only if the erase doesn’t go through.'

/** An API that serves no conversations (A16 switched off) answers the list with 404: not a failure to try again. */
const unserved = (error: unknown) => error instanceof ApiError && error.status === 404

/**
 * What the list's read says: waiting, not served here, failed (out of date when some were read), or none yet; and,
 * to a member who would write, why they can't now (the project's conversations not on, or read-only).
 */
function ListState(props: {
  read: {
    isPending: boolean
    isError: boolean
    isSuccess: boolean
    error: unknown
    refetch: () => Promise<unknown>
  }
  /** How many are shown; null while none may be (fenced): neither «out of date» nor «none yet» is said then. */
  count: number | null
  capability: ConversationList['capability'] | undefined
}) {
  const { read, count, capability } = props
  if (read.isError && unserved(read.error)) {
    return <p className="conv-note">Conversations aren’t available here yet.</p>
  }
  return (
    <>
      <Waiting words="Reading the conversations…" waiting={read.isPending} />
      {capability?.state === 'off' && <p className="conv-note">Conversations aren’t turned on for this project yet.</p>}
      {capability?.state === 'read_only' && (
        <p className="conv-note">Conversations here are read-only for now: they can be read, and messages withdrawn.</p>
      )}
      {read.isError && (
        <p className="conv-note" role="alert">
          {count !== null && count > 0 ? 'This may be out of date.' : 'The conversations can’t be read now.'}{' '}
          <button type="button" className="text-button" onClick={() => void read.refetch()}>
            Try again
          </button>
        </p>
      )}
      {read.isSuccess && count === 0 && <p className="conv-note">No conversations in this project yet.</p>}
    </>
  )
}
