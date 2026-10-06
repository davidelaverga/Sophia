// The chat: the project's recent discussion and the conversation with Sophia, typed and, as live captions, spoken
// (CX-0023), newest at the bottom, then the composer. It lives in the room's side panel (StudioShell), as meeting apps have it, so the stage keeps Sophia's
// light and the people at its centre. Discussion never starts work.
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { DiscussionEntry, Snapshot } from '@sophia/contracts'
import { listReplies, type DiscussionReply } from '../../api/vision.ts'
import { VISION } from '../../app/vision.ts'
import type { Identity } from '../../app/dev-identity.ts'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'
import { captionText, type CaptionTurn } from './captions.ts'
import { chatTimeline, type ChatEntryItem, type ChatTurn } from './chat-view.ts'
import { Composer } from './Composer.tsx'
import { authorLabel } from './conversation-view.ts'
import { NoticeCard } from './NoticeCard.tsx'
import { quoteOf } from './replies.ts'
import type { Replying } from './ReplyingTo.tsx'

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

export function Conversation(props: Props) {
  const { projectId, identity, snapshot, me, names, room, draft, onDraft, onShowRoom } = props
  const discussion = snapshot?.discussion ?? []
  const history = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  useLayoutEffect(() => {
    if (history.current && following.current) history.current.scrollTop = history.current.scrollHeight
  }, [room.chat, room.notices, room.captions, snapshot?.discussion])
  useFollowOnResize(history, following)
  const onScroll = () => {
    const el = history.current
    if (el) following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64
  }
  const timeline = chatTimeline(room.chat, room.notices, room.captions)
  const empty = discussion.length === 0 && timeline.length === 0
  const [replying, setReplying] = useState<Replying | null>(null)
  const replies = useReplies(projectId, identity, snapshot?.cursor)
  return (
    <div className="conversation">
      <div className="conversation-history" ref={history} onScroll={onScroll}>
        {empty && <p className="chat-empty">Messages stay in this conversation. Notes live in the brief.</p>}
        <Discussion
          entries={discussion}
          me={me}
          names={names}
          replies={replies}
          onReply={VISION ? setReplying : undefined}
        />
        {timeline.length > 0 && (
          <ol className="chat-messages" aria-label="Conversation with Sophia">
            {timeline.map((entry) => (
              <li key={entryKey(entry)}>
                {entry.type === 'turn' && <Turn turn={entry.turn} />}
                {entry.type === 'notice' && (
                  <NoticeCard notice={entry.notice} projectId={projectId} identity={identity} />
                )}
                {entry.type === 'caption' && <Caption caption={entry.caption} me={me} names={names} />}
              </li>
            ))}
          </ol>
        )}
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
      />
    </div>
  )
}

/** Which entries of the discussion answer which (A20, proposed; the vision flag's), read again as the feed moves. */
function useReplies(projectId: string, identity: Identity, cursor: string | undefined) {
  const read = useQuery({
    queryKey: ['vision', 'replies', projectId, identity.name, cursor],
    queryFn: ({ signal }) => listReplies(identity.token, projectId, signal),
    placeholderData: keepPreviousData,
    enabled: VISION,
  })
  return new Map((read.data?.replies ?? []).map((r) => [r.entryId, r.replyTo]))
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

/** One typed message and Sophia's reply to it. */
function Turn({ turn }: { turn: ChatTurn }) {
  return (
    <>
      <div className="chat-message user">
        <strong>You</strong>
        <p>{turn.text}</p>
      </div>
      <div className="chat-message sophia">
        <strong>Sophia</strong>
        <p>{turn.reply || (turn.state === 'sending' ? 'Sending…' : turn.state === 'responding' ? 'Thinking…' : '')}</p>
        {turn.reason && (
          <p className="chat-status" role="status">
            {turn.reason}
          </p>
        )}
      </div>
    </>
  )
}

interface DiscussionProps {
  entries: readonly DiscussionEntry[]
  me: string
  names: ReadonlyMap<string, string>
  /** What each reply answers, by the reply's entry id (A20). */
  replies: ReadonlyMap<string, DiscussionReply['replyTo']>
  /** Reply to an entry (the vision flag's): absent, no entry offers it. */
  onReply: ((replying: Replying) => void) | undefined
}

function Discussion({ entries, me, names, replies, onReply }: DiscussionProps) {
  if (entries.length === 0) return null
  const here = new Set(entries.map((e) => e.id))
  return (
    <ol className="discussion" aria-label="Recent discussion">
      {entries.map((entry) => {
        const author = authorLabel(entry.actorId, me, names)
        const answers = replies.get(entry.id)
        return (
          <li key={entry.id} id={`entry-${entry.id}`} className="contribution" tabIndex={-1}>
            {answers && <Quote answers={answers} here={here.has(answers.id)} me={me} names={names} />}
            <span className="contribution-author">{author}</span>
            <span className="contribution-text">{entry.text}</span>
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
          </li>
        )
      })}
    </ol>
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
      aria-label={`Replying to ${author}: ${answers.excerpt}`}
      onClick={go}
    >
      {words}
    </button>
  )
}
