// Explicit mentions in the room's chat (docs/plans/mentions.md, A37; the mentions flag's). An editor or an admin
// chooses up to five members, by their current display names, before sending a message to the room; the message
// names them, and each finds it among what needs them. Nothing is read from the words: a name typed in the message
// mentions nobody. A viewer writes as before and is never offered the choice.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProjectMember } from '@sophia/contracts'
import { getProjectMembers } from '../../api/client.ts'
import { markNeedSeen } from '../../api/needs.ts'
import { tokenSubject } from '../../app/auth-callback.ts'
import { MESSAGE } from '../resources/link.ts'
import { useAddressed } from '../resources/useAddressed.ts'
import { MENTIONS } from '../../app/mentions.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useMembership } from '../access/useAccess.ts'
import { canMention, labelOf, mentionWords, MOST_MENTIONS, nameable, toggled } from './mention-view.ts'

/** The project's members by actor id, with their current names (A25's read, shared with Goals' owners). */
export function useMemberNames(projectId: string, identity: Identity, enabled = MENTIONS) {
  const read = useQuery({
    queryKey: ['members', projectId, identity.name],
    queryFn: () => getProjectMembers(identity.token, projectId),
    staleTime: 60_000,
    enabled,
  })
  const members = read.data?.members ?? []
  // Known only once read: before that, or after a failed read, nobody is offered and no recipient is named (Codex on
  // #409), never «a former member» for someone who may well be one.
  return { known: read.isSuccess, members, byId: new Map(members.map((m) => [m.actorId, m])) }
}

/** The recipients a message to the room will name: chosen here, sent with it, cleared once it is recorded. */
export interface MentionsUnderWay {
  ids: readonly string[]
  done: () => void
}

/** The mention choice for the bar: offered to an editor or an admin writing to the room, under the mentions flag. */
export function useMentions(projectId: string, identity: Identity, toRoom: boolean) {
  const membership = useMembership(projectId, identity.name, identity.token).data
  const { known, members } = useMemberNames(projectId, identity)
  const [chosen, setChosen] = useState<readonly string[]>([])
  const [open, setOpen] = useState(false)
  const offered = MENTIONS && known && toRoom && canMention(membership?.role)
  const me = membership?.actorId ?? ''
  // Someone who left since being chosen is no longer named.
  const ids = chosen.filter((id) => members.some((m) => m.actorId === id))
  return {
    offered,
    options: nameable(members, me),
    chosen: offered ? ids : [],
    toggle: (id: string) => setChosen((now) => toggled(now, id)),
    open,
    setOpen,
    // Recorded: the choice clears and closes for the next message.
    underWay: {
      ids: offered ? ids : [],
      done: () => {
        setChosen([])
        setOpen(false)
      },
    } satisfies MentionsUnderWay,
  }
}

interface PickerProps {
  options: readonly ProjectMember[]
  chosen: readonly string[]
  toggle: (id: string) => void
  open: boolean
  setOpen: (open: boolean) => void
}

/** «Mention»: the members to name, as checkboxes, at most five; the chosen ones said above the bar. */
export function MentionPicker({ options, chosen, toggle, open, setOpen }: PickerProps) {
  const full = chosen.length >= MOST_MENTIONS
  const names = options.filter((m) => chosen.includes(m.actorId)).map((m) => labelOf(m))
  return (
    <div className="mention-picker">
      <p className="mention-chosen" aria-live="polite">
        {names.length > 0 ? `Mentions ${names.join(', ')}` : ''}
      </p>
      <button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Done' : 'Mention'}
      </button>
      {open && (
        <fieldset className="mention-options">
          <legend>Mention members (up to {MOST_MENTIONS})</legend>
          {options.map((m) => {
            const on = chosen.includes(m.actorId)
            return (
              <label key={m.actorId}>
                <input type="checkbox" checked={on} disabled={full && !on} onChange={() => toggle(m.actorId)} />
                {labelOf(m)}
              </label>
            )
          })}
        </fieldset>
      )}
    </div>
  )
}

/** Under a message that names members: whom, by their current names, the reader as «you»; nothing until they are read. */
export function MentionedLine(props: {
  ids: readonly string[] | undefined
  me: string
  byId: ReadonlyMap<string, ProjectMember>
  known: boolean
}) {
  if (!props.known || !props.ids || props.ids.length === 0) return null
  return <span className="contribution-mentions">{mentionWords(props.ids, props.me, props.byId)}</span>
}

/** A mention's need id (A37): `mention:<projectId>:<revision>:<contributionId>`. */
export const mentionNeedId = (projectId: string, revision: number, contributionId: string) =>
  `mention:${projectId}:${String(revision)}:${contributionId}`

/**
 * A message that mentions the reader is seen once it is shown (Codex on #409): the chat on screen (`inView`) and the
 * entry itself in the chat's scrolled view. Then, once per revision, its need is marked seen and Home reads its needs
 * again. A message beyond the chat's window, a closed chat, a project that failed to read: nothing is marked.
 */
export function useMentionsSeen(
  identity: Identity,
  history: RefObject<HTMLElement | null>,
  inView: boolean,
  shown: string,
) {
  const client = useQueryClient()
  const marked = useRef(new Set<string>())
  useEffect(() => {
    const root = history.current
    if (!MENTIONS || !inView || !root || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      (seen) => {
        for (const entry of seen) {
          const id =
            entry.isIntersecting && entry.target instanceof HTMLElement ? entry.target.dataset.mentionNeed : undefined
          if (!id || marked.current.has(id)) continue
          marked.current.add(id)
          const again = () =>
            client.invalidateQueries({ queryKey: ['vision', 'needs', tokenSubject(identity.token) ?? identity.token] })
          // A write that fails is tried again the next time the message is shown.
          void markNeedSeen(identity.token, id).then(again, () => marked.current.delete(id))
        }
      },
      { root, threshold: 0.6 },
    )
    for (const el of root.querySelectorAll('[data-mention-need]')) observer.observe(el)
    return () => observer.disconnect()
  }, [client, identity.token, history, inView, shown])
}

/** A message named in the address (#message-<id>, a mention from Home): brought into the chat's view once shown. */
export function useMessageAddressed(history: RefObject<HTMLElement | null>, inView: boolean, shown: string) {
  const named = useAddressed(MESSAGE)
  useEffect(() => {
    if (!inView || !named.id) return
    const el = history.current?.querySelector(`[data-message="${CSS.escape(named.id)}"]`)
    el?.scrollIntoView({ block: 'center' })
  }, [history, inView, named.id, named.seq, shown])
}
