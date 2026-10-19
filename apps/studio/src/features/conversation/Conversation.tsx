// The chat: the project's recent discussion and the conversation with Sophia, typed and, as live captions, spoken
// (CX-0023), newest at the bottom, then the composer. A day line opens each day, and each message says its time
// (chat-times.md). It lives in the room's side panel (StudioShell), as meeting apps have it, so the stage keeps Sophia's
// light and the people at its centre. Discussion never starts work.
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { DiscussionEntry, ProjectMember, Snapshot, WithdrawnEntry } from '@sophia/contracts'
import { EmptyState } from '@sophia/ui'
import { listReplies, type DiscussionReply } from '../../api/vision.ts'
import { VISION } from '../../app/vision.ts'
import { MESSAGE_ACTS } from '../../app/message-acts.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import type { Identity } from '../../app/dev-identity.ts'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'
import { captionText, type CaptionTurn } from './captions.ts'
import { chatTimeline, type ChatEntryItem, type ChatTurn } from './chat-view.ts'
import { Composer } from './Composer.tsx'
import { authorLabel, withAuthors } from './conversation-view.ts'
import { EarlierLine, useEarlierDiscussion } from './EarlierDiscussion.tsx'
import { EditedMark, MessageActions, useHandedFocus, WithdrawnWords, type Acted } from './MessageActions.tsx'
import { MentionedLine, useMemberNames } from './MentionPicker.tsx'
import { ADDRESS_WORDS, JUMP_FAILED, needFor, type AddressState, type Waiting } from './mention-view.ts'
import { useMentionsSeen, useMessageAddressed, useMyMentions } from './useMentionAttention.ts'
import type { Earlier } from './EarlierDiscussion.tsx'
import { actsOf, discussionItems, lastSaidAt } from './message-acts.ts'
import { NoticeCard } from './NoticeCard.tsx'
import { quoteOf } from './replies.ts'
import type { Replying } from './ReplyingTo.tsx'
import { RichText } from '../../app/RichText.tsx'
import { clock } from '../../app/time-words.ts'
import { useNow } from '../../app/use-now.ts'
import { dayBreaks, todayAfter } from './chat-days.ts'
import { AwayDivider, useWhileAway, type AwayMark } from './WhileAway.tsx'

interface Props {
  projectId: string
  identity: Identity
  snapshot: Snapshot | undefined
  /** This viewer's actor id, so their own lines say "You". */
  me: string
  /** Names the room knows, by identity: the snapshot carries actor ids only. */
  names: ReadonlyMap<string, string>
  room: ProjectRoom
  draft: string
  onDraft: (text: string) => void
  /** Closes the panel, so the room's dock shows (Composer). */
  onShowRoom: () => void
  /** The chat is on screen (its tab open in the room): only then is a mention seen (A37). */
  inView?: boolean
}

/** Opening the panel (or resizing it) keeps the newest line in view while the reader follows along. */
function useFollowOnResize(history: RefObject<HTMLDivElement | null>, following: RefObject<boolean>) {
  useEffect(() => {
    const el = history.current
    if (!el) return undefined
    const observer = new ResizeObserver(() => {
      if (following.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [history, following])
}

/** The history follows the newest line while the reader is at the bottom; scrolled up, it stays where they read. */
function useFollowing(room: ProjectRoom, discussion: Snapshot['discussion'] | undefined) {
  const history = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  useLayoutEffect(() => {
    if (history.current && following.current) history.current.scrollTop = history.current.scrollHeight
  }, [room.chat, room.notices, room.captions, discussion])
  useFollowOnResize(history, following)
  const onScroll = () => {
    const el = history.current
    if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64
  }
  return { history, following, onScroll }
}

/** The call's lines with Sophia: turns, notices and captions, in order. */
function Timeline(props: {
  timeline: ReturnType<typeof chatTimeline>
  projectId: string
  identity: Props['identity']
  me: string
  names: ReadonlyMap<string, string>
}) {
  const { timeline, projectId, identity, me, names } = props
  return (
    <ol className="chat-messages" aria-label="Conversation with Sophia">
      {timeline.map((entry) => (
        <li key={entryKey(entry)}>
          {entry.type === 'turn' && <Turn turn={entry.turn} />}
          {entry.type === 'notice' && <NoticeCard notice={entry.notice} projectId={projectId} identity={identity} />}
          {entry.type === 'caption' && <Caption caption={entry.caption} me={me} names={names} />}
        </li>
      ))}
    </ol>
  )
}

export function Conversation(props: Props) {
  const { projectId, identity, snapshot, me, names, room, draft, onDraft, onShowRoom } = props
  const discussion = snapshot?.discussion ?? []
  const { history, following, onScroll } = useFollowing(room, snapshot?.discussion)
  const timeline = chatTimeline(room.chat, room.notices, room.captions)
  const withdrawnNow = snapshot?.discussionWithdrawn
  const empty = nothingSaid(discussion, withdrawnNow, timeline)
  const [replying, setReplying] = useState<Replying | null>(null)
  const replies = useReplies(projectId, identity, snapshot?.cursor)
  const earlier = useEarlierDiscussion(projectId, identity, discussion, history, withdrawnNow)
  const acts = useMessageActs(projectId, identity, earlier.revise)
  const members = useMentionShown(props, history, earlier)
  useReplyGone(replying, earlier.withdrawn, setReplying)
  const away = useWhileAway({ history, following }, earlier.entries)
  return (
    <div className="conversation">
      {away.line}
      <div className="conversation-history" ref={history} onScroll={onScroll}>
        {empty && (
          <EmptyState className="chat-empty">Messages stay in this conversation. Notes live in the brief.</EmptyState>
        )}
        <TopLines earlier={earlier} address={members.address} />
        <Discussion
          {...shownOf(earlier)}
          acts={acts}
          named={members}
          me={me}
          names={names}
          replies={replies.of}
          onReply={VISION ? setReplying : undefined}
          away={away.divider}
        />
        {VISION && discussion.length > 0 && <RepliesState failed={replies.failed} onRetry={replies.retry} />}
        <TodayLine lastAt={lastSaidAt(earlier.entries, earlier.withdrawn)} shown={timeline.length > 0} />
        {timeline.length > 0 && <Timeline {...{ timeline, projectId, identity, me, names }} />}
      </div>
      <Composer
        projectId={projectId}
        identity={identity}
        snapshot={snapshot}
        room={room}
        draft={draft}
        onDraft={onDraft}
        onShowRoom={onShowRoom}
        replying={replying}
        onStopReplying={() => setReplying(null)}
        onSend={away.sent}
      />
    </div>
  )
}

/**
 * An entry's attributes: its id for the address (#message-, A37); a mention of the reader carries its need's id, so
 * the chat can say when it was shown; with replies (A20), its own anchor and focus.
 */
const entryAttrs = (entry: DiscussionEntry, waiting: ReadonlyMap<string, Waiting>, replies: boolean) => {
  // Only on the revision shown: a need for another revision of this message is not attached (fail closed).
  const need = needFor(waiting.get(entry.id), entry.revision)
  return {
    'data-message': entry.id,
    ...(need ? { 'data-mention-need': need } : {}),
    ...(replies ? { id: `entry-${entry.id}`, tabIndex: -1 } : {}),
  }
}

/**
 * The project's members, to say whom a message mentions; the mentions the reader was shown are seen, and a message
 * named in the address is brought into view (A37).
 */
function useMentionShown(props: Props, history: RefObject<HTMLDivElement | null>, earlier: Earlier) {
  const { projectId, identity, me } = props
  const inView = props.inView ?? false
  // Whom each names too: a mention-only correction keeps the revision, and the newly named entry is observed (Codex on #409).
  const shown =
    earlier.entries.map((e) => `${e.id}@${String(e.revision ?? 0)}:${(e.mentions ?? []).join('+')}`).join(',') +
    projectId +
    me
  // The occurrences the service lists as waiting for the reader, never an id made up here (V on #409).
  const waiting = useMyMentions(identity, projectId, props.snapshot?.cursor)
  useMentionsSeen(identity, history, inView, waiting, shown)
  const address = useMessageAddressed(history, inView, earlier, props.snapshot !== undefined, shown)
  return { ...useMemberNames(projectId, identity), projectId, waiting, address }
}

/**
 * The chat's top: what it says of a message the address named when it can't show it (A37), or when the page a search
 * found it in couldn't be read, with Try again (A38); then the earlier ones.
 */
function TopLines(props: { earlier: Earlier; address: { at: AddressState; retry: (() => void) | null } }) {
  const { earlier, address } = props
  const words = ADDRESS_WORDS[address.at]
  const retry = address.retry
  return (
    <>
      {words && (
        <p className="chat-status" role="status">
          {words}
        </p>
      )}
      {retry && (
        <p className="chat-status" role="alert">
          {JUMP_FAILED}{' '}
          <button type="button" className="text-button" onClick={retry}>
            Try again
          </button>
        </p>
      )}
      <EarlierLine earlier={earlier} />
    </>
  )
}

/** What the discussion shows from what was read: its messages, withdrawn places, and a found page's gap (A38). */
const shownOf = ({ entries, withdrawn, gaps }: Earlier) => ({ entries, withdrawn, gaps })

/** Nothing to show yet: no message, no withdrawn one's place (A36), no turn with Sophia. */
const nothingSaid = (
  discussion: readonly unknown[],
  withdrawn: readonly unknown[] = [],
  timeline: readonly unknown[],
) => discussion.length + withdrawn.length + timeline.length === 0

/** A reply to a message withdrawn since keeps none of its words (A36): it is dropped. */
function useReplyGone(replying: Replying | null, withdrawn: readonly WithdrawnEntry[], drop: (r: null) => void) {
  const gone = replying !== null && withdrawn.some((w) => w.id === replying.id)
  useEffect(() => {
    if (gone) drop(null)
  }, [gone, drop])
}

/**
 * The reader's own message acts (A36, the message acts flag's): what an act changed shows at once, and a refusal that
 * says the chat moved reads it again. Absent without the flag, so no message offers them.
 */
function useMessageActs(
  projectId: string,
  identity: Identity,
  revise: (acted: Acted) => void,
): MessageActsOf | undefined {
  const queryClient = useQueryClient()
  if (!MESSAGE_ACTS) return undefined
  return {
    projectId,
    identity,
    onActed: (acted) => {
      revise(acted)
      if (acted.type === 'reread')
        void queryClient.invalidateQueries({ queryKey: snapshotKey(projectId, identity.name), exact: true })
    },
  }
}

/**
 * Which entries of the discussion answer which (A20, proposed; the vision flag's), read again as the feed moves. A read
 * that fails says so: without it, every reply would pass for a message on its own.
 */
function useReplies(projectId: string, identity: Identity, cursor: string | undefined) {
  const read = useQuery({
    queryKey: ['vision', 'replies', projectId, identity.name, cursor],
    queryFn: ({ signal }) => listReplies(identity.token, projectId, signal),
    placeholderData: keepPreviousData,
    enabled: VISION,
    retry: 1,
  })
  // A failure stays said until a read succeeds: the read the next message starts is no news yet, and the line neither
  // blinks nor is read out again with every message. The last links read stay meanwhile.
  const [seen, setSeen] = useState<{ last: typeof read.data; failed: boolean }>({ last: undefined, failed: false })
  const fresh = read.isSuccess && !read.isPlaceholderData ? read.data : undefined
  if (fresh !== undefined && (fresh !== seen.last || seen.failed)) setSeen({ last: fresh, failed: false })
  else if (read.isError && !seen.failed) setSeen({ last: seen.last, failed: true })
  return {
    of: new Map(((read.data ?? seen.last)?.replies ?? []).map((r) => [r.entryId, r.replyTo])),
    failed: seen.failed,
    // A press while a read goes joins it rather than starting over.
    retry: () => void read.refetch({ cancelRefetch: false }),
  }
}

/**
 * Whether what answers what was read, said under the discussion: a failure, with a way to read it again. The line stays
 * in the page, empty, for its words to be read when they come.
 */
function RepliesState({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const pressed = useRef(false)
  useEffect(() => {
    if (failed || !pressed.current) return
    pressed.current = false
    // Try again went with the failure: the focus it held goes to the message field, the next thing to use.
    if (document.activeElement === document.body) document.getElementById('converse-draft')?.focus()
  }, [failed])
  return (
    <p className="chat-status replies-state" role="status">
      {failed && (
        <>
          Replies didn’t load, so messages show without what they answer.{' '}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              pressed.current = true
              onRetry()
            }}
          >
            Try again
          </button>
        </>
      )}
    </p>
  )
}

function entryKey(entry: ChatEntryItem): string {
  if (entry.type === 'turn') return entry.turn.id
  return entry.type === 'notice' ? `notice:${entry.notice.key}` : `caption:${entry.caption.id}`
}

/**
 * Something said aloud, marked as spoken. Its words reach screen readers once it has ended: a caption still being said
 * changes with every fragment, which would be read out again and again.
 */
function Caption({ caption, me, names }: { caption: CaptionTurn; me: string; names: ReadonlyMap<string, string> }) {
  const sophia = caption.speaker === 'sophia'
  const partial = caption.state === 'partial'
  return (
    <div className={`chat-message ${sophia ? 'sophia' : 'user'} spoken`} data-state={caption.state}>
      <strong>{sophia ? 'Sophia' : authorLabel(caption.actorId ?? '', me, names)}</strong>
      <span className="chat-spoken">Spoken</span>
      <p aria-hidden={partial || undefined}>{captionText(caption)}</p>
      {caption.state === 'interrupted' && <p className="chat-status">Cut off</p>}
    </div>
  )
}

/** «Today» above the turns with Sophia, when the discussion before them ends on another day. */
function TodayLine({ lastAt, shown }: { lastAt: string | undefined; shown: boolean }) {
  const now = useNow()
  return shown && todayAfter(lastAt, now) ? <span className="chat-day">Today</span> : null
}

/** When, on a 24-hour clock, as a `<time>`: by the author's name. */
function At({ at, className }: { at: Date; className: string }) {
  if (Number.isNaN(at.getTime())) return null
  return (
    <time className={className} dateTime={at.toISOString()}>
      {clock(at)}
    </time>
  )
}

/** One typed message and Sophia's reply to it, their web addresses as links, as the discussion's are. */
function Turn({ turn }: { turn: ChatTurn }) {
  const waiting = turn.state === 'sending' ? 'Sending…' : turn.state === 'responding' ? 'Thinking…' : ''
  return (
    <>
      <div className="chat-message user">
        <strong>You</strong> <At at={new Date(turn.sentAt)} className="chat-at" />
        <p>
          <RichText text={turn.text} />
        </p>
      </div>
      <div className="chat-message sophia">
        <strong>Sophia</strong>
        <p>{turn.reply ? <RichText text={turn.reply} /> : waiting}</p>
        {turn.reason && (
          <p className="chat-status" role="status">
            {turn.reason}
          </p>
        )}
      </div>
    </>
  )
}

interface MessageActsOf {
  projectId: string
  identity: Identity
  onActed: (acted: Acted) => void
}

interface DiscussionProps {
  entries: readonly DiscussionEntry[]
  /** Where withdrawn messages stood (A36): their places, never their words. */
  withdrawn: readonly WithdrawnEntry[]
  /** The reader's own message acts (the message acts flag's); absent, no message offers them. */
  acts: MessageActsOf | undefined
  /** The project's members by id, to say whom a message mentions (A37), once read; the mentions waiting for the reader. */
  named: { known: boolean; byId: ReadonlyMap<string, ProjectMember>; waiting: ReadonlyMap<string, Waiting> }
  me: string
  names: ReadonlyMap<string, string>
  /** What each reply answers, by the reply's entry id (A20). */
  replies: ReadonlyMap<string, DiscussionReply['replyTo']>
  /** Reply to an entry (the vision flag's): absent, no entry offers it. */
  onReply: ((replying: Replying) => void) | undefined
  /** Where messages between were never read (A38): a gap's line goes after each of those messages. */
  gaps: Earlier['gaps']
  /** What came while the tab was hidden: the divider above the first drawn of it (WhileAway.tsx). */
  away: AwayMark | null
}

function Discussion(props: DiscussionProps) {
  const { entries, withdrawn, acts, named, me, names: known, replies, onReply, gaps, away } = props
  const now = useNow()
  if (entries.length === 0 && withdrawn.length === 0) return null
  const items = discussionItems(entries, withdrawn)
  const days = dayBreaks(
    items.map((e) => e.createdAt),
    now,
  )
  const here = new Set(entries.map((e) => e.id))
  // Each message's own author name for an author the call doesn't know (A17): outside a call, no «A member».
  const names = withAuthors(known, [...entries, ...withdrawn])
  return (
    <ol className="discussion" aria-label="Recent discussion">
      {items.map((item, i) => {
        // The gap's line, after the message it follows (A38).
        const gapLine = gaps.after.includes(item.id) ? <GapLine key="gap" gaps={gaps} after={item.id} /> : null
        if (item.type === 'withdrawn')
          return [<Withdrawn key={item.id} withdrawn={item.withdrawn} day={days[i]} me={me} names={names} />, gapLine]
        const { entry } = item
        const author = authorLabel(entry.actorId, me, names)
        const answers = replies.get(entry.id)
        // Main's formatting (#384, RichText) inside C3's acts and mention line.
        const words = (
          <span className="contribution-text">
            <RichText text={entry.text} />
          </span>
        )
        return [
          <li key={entry.id} className="contribution" {...entryAttrs(entry, named.waiting, !!onReply)}>
            {days[i] && <span className="chat-day">{days[i]}</span>}
            {away?.id === entry.id && <AwayDivider words={away.words} />}
            {answers && <Quote answers={answers} here={here.has(answers.id)} me={me} names={names} />}
            <span className="contribution-author">{author}</span>
            <At at={new Date(entry.createdAt)} className="contribution-at" />
            {acts && <EditedMark entry={entry} />}
            {acts ? (
              <MessageActions {...acts} entry={entry} acts={actsOf(entry, me)}>
                {words}
              </MessageActions>
            ) : (
              words
            )}
            <MentionedLine ids={entry.mentions} me={me} byId={named.byId} known={named.known} />
            {onReply && (
              <button
                type="button"
                className="text-button contribution-reply"
                aria-label={`Reply to ${author}`}
                onClick={() => onReply({ id: entry.id, author, quote: quoteOf(entry.text) })}
              >
                Reply
              </button>
            )}
          </li>,
          gapLine,
        ]
      })}
    </ol>
  )
}

/**
 * Where messages between were never read (A38): they aren't shown until the reader asks; each press reads one page under
 * the gap (A23), until no message between is unread.
 */
function GapLine({ gaps, after }: { gaps: Earlier['gaps']; after: string }) {
  const reading = gaps.reading(after)
  const loading = reading === 'loading'
  return (
    <li className="discussion-earlier discussion-gap">
      <p>{reading === 'failed' ? 'Couldn’t load the newer messages.' : 'Newer messages aren’t shown here.'}</p>
      <button
        type="button"
        className="text-button"
        aria-disabled={loading || undefined}
        onClick={() => !loading && gaps.fill(after)}
      >
        {loading ? 'Loading…' : reading === 'failed' ? 'Try again' : 'Show them'}
      </button>
    </li>
  )
}

/** Where a withdrawn message stood (A36): who and when, never its words. */
function Withdrawn(props: {
  withdrawn: WithdrawnEntry
  day: string | null | undefined
  me: string
  names: ReadonlyMap<string, string>
}) {
  const { withdrawn: w, day, me, names } = props
  const place = useRef<HTMLLIElement>(null)
  useHandedFocus(props.withdrawn.id, 'place', place)
  return (
    // It takes the focus its own withdrawal held (MessageActions' handFocus).
    <li ref={place} id={`withdrawn-${w.id}`} className="contribution withdrawn" tabIndex={-1}>
      {day && <span className="chat-day">{day}</span>}
      <span className="contribution-author">{authorLabel(w.actorId, me, names)}</span>
      <At at={new Date(w.createdAt)} className="contribution-at" />
      <WithdrawnWords mine={w.actorId === me} />
    </li>
  )
}

/**
 * What a reply answers, quoted above its words: it takes you to that message while the discussion still holds it, and
 * is plain words when it doesn't.
 */
function Quote(props: {
  answers: DiscussionReply['replyTo']
  here: boolean
  me: string
  names: ReadonlyMap<string, string>
}) {
  const { answers } = props
  const author = authorLabel(answers.actorId, props.me, props.names)
  const words = `↪ ${author}: “${quoteOf(answers.excerpt)}”`
  if (!props.here) return <span className="contribution-quote">{words}</span>
  const go = () => {
    const original = document.getElementById(`entry-${answers.id}`)
    original?.scrollIntoView({ block: 'nearest' })
    original?.focus({ preventScroll: true })
  }
  return (
    <button
      type="button"
      className="contribution-quote"
      aria-label={`Go to ${author}’s message: ${answers.excerpt}`}
      onClick={go}
    >
      {words}
    </button>
  )
}
