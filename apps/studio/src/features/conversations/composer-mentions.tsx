import { useId, useState, type ReactNode } from 'react'
import { Icon, usePopover } from '@sophia/ui'
import type { ProjectMember } from '@sophia/contracts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { useMemberNames } from '../conversation/MentionPicker.tsx'
import { labelOf, MOST_MENTIONS, nameable, toggled } from '../conversation/mention-view.ts'
import { mentionsAt, useKept, withDraftMentions } from './talk-store.ts'

interface Scope {
  projectId: string
  conversationId: string
  slot: string | null
  me: string
  identity: Identity
}

const EMPTY: readonly string[] = []

/** Match the original draft selection before clearing it after a receipt. */
const sameMentions = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i])

export function useComposerMentions(
  { projectId, conversationId, slot, me, identity }: Scope,
  enabled: boolean,
  held: { ask: { mentions?: readonly string[] } } | null,
) {
  const { kept, change } = useKept(projectId, accountOf(identity))
  const draft = mentionsAt(kept, conversationId, slot)
  const ids = held ? (held.ask.mentions ?? EMPTY) : draft
  const read = useMemberNames(projectId, identity, enabled)
  const options = read.known && enabled ? nameable(read.members, me) : []
  const unavailable = ids.some((id) => !options.some((member) => member.actorId === id))
  const set = (next: readonly string[]) => change((k) => withDraftMentions(k, conversationId, slot, next))
  const clearIf = (sent: readonly string[], text?: string) => {
    let same = false
    change((k) => {
      if (!sameMentions(mentionsAt(k, conversationId, slot), sent)) return k
      const words = slot ? k.replyDrafts[conversationId]?.drafts[slot] : k.drafts[conversationId]
      if (text !== undefined && (words ?? '').trim() !== text.trim()) return k
      same = true
      return withDraftMentions(k, conversationId, slot, EMPTY)
    })
    return same
  }
  const toggle = (id: string) =>
    change((k) => withDraftMentions(k, conversationId, slot, toggled(mentionsAt(k, conversationId, slot), id)))
  return {
    ids,
    ready: held !== null || !unavailable,
    clearIf,
    controls: (
      <ComposerMentions
        key={JSON.stringify([conversationId, slot])}
        ids={ids}
        options={options}
        held={held !== null}
        known={read.known}
        enabled={enabled}
        unavailable={unavailable}
        clear={() => set(EMPTY)}
        toggle={toggle}
      />
    ),
  }
}

function ComposerMentions(props: {
  ids: readonly string[]
  options: readonly ProjectMember[]
  held: boolean
  known: boolean
  enabled: boolean
  unavailable: boolean
  clear: () => void
  toggle: (id: string) => void
}): ReactNode {
  const [open, setOpen] = useState(false)
  const pickerId = useId()
  const popover = usePopover(open, () => setOpen(false))
  const { ids, options, held, known, enabled, toggle } = props
  if (!enabled) return null
  return (
    <div className="conv-mention-controls" ref={popover.wrap} onKeyDown={popover.onKeyDown}>
      <MentionChips
        ids={ids}
        options={options}
        held={held}
        known={known}
        toggle={(id) => {
          toggle(id)
          popover.opener.current?.focus()
        }}
      />
      {held ? (
        ids.length > 0 && <p className="conv-note conv-context-status">The original mentions will be kept on retry.</p>
      ) : (
        <button
          type="button"
          ref={popover.opener}
          className="ghost conv-context-action"
          aria-expanded={open}
          aria-controls={open ? pickerId : undefined}
          onClick={() => setOpen(!open)}
        >
          <span aria-hidden>@</span> Mention
        </button>
      )}
      <MentionStatus {...props} />
      {open && !held && (
        <MentionOptions
          props={props}
          pickerId={pickerId}
          popover={popover}
          done={() => {
            setOpen(false)
            popover.opener.current?.focus()
          }}
        />
      )}
    </div>
  )
}

function MentionChips({
  ids,
  options,
  held,
  known,
  toggle,
}: Pick<Parameters<typeof ComposerMentions>[0], 'ids' | 'options' | 'held' | 'known' | 'toggle'>) {
  return (
    <>
      {ids.length > 0 && (
        <ul className="conv-mention-chips" aria-label="Selected mentions">
          {ids.map((id) => {
            const member = options.find((option) => option.actorId === id)
            const name = member ? labelOf(member) : known ? 'Unavailable member' : 'Checking member…'
            return (
              <li key={id}>
                <span>@{name}</span>
                {!held && (
                  <button
                    type="button"
                    className="conv-context-remove"
                    aria-label={`Remove mention ${name}`}
                    onClick={() => toggle(id)}
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
function MentionOptions({
  props,
  pickerId,
  popover,
  done,
}: {
  props: Parameters<typeof ComposerMentions>[0]
  pickerId: string
  popover: ReturnType<typeof usePopover>
  done: () => void
}) {
  const { ids, options, known, toggle } = props
  const full = ids.length >= MOST_MENTIONS
  return (
    <div id={pickerId} className="conv-context-panel conv-mention-panel" ref={popover.panel}>
      <fieldset>
        <legend>Mention members (up to {MOST_MENTIONS})</legend>
        {options.map((member) => {
          const chosen = ids.includes(member.actorId)
          return (
            <label key={member.actorId}>
              <input
                type="checkbox"
                checked={chosen}
                disabled={full && !chosen}
                onChange={() => toggle(member.actorId)}
              />
              {labelOf(member)}
            </label>
          )
        })}
        <label className="conv-mention-unavailable">
          <input type="checkbox" disabled aria-describedby={`${pickerId}-sophia`} />
          Sophia · unavailable
        </label>
      </fieldset>
      <p id={`${pickerId}-sophia`}>Sophia cannot be addressed through this member picker.</p>
      {!known && <p role="status">Member names aren’t available yet. Reopen this conversation to try again.</p>}
      {known && options.length === 0 && <p>No other project members to mention.</p>}
      <p>Mentions are recorded with this message. No notification or Sophia response is requested.</p>
      <button type="button" className="text-button" onClick={done}>
        Done
      </button>
    </div>
  )
}

function MentionStatus({
  unavailable,
  ids,
  held,
  known,
  clear,
}: Pick<Parameters<typeof ComposerMentions>[0], 'unavailable' | 'ids' | 'held' | 'known' | 'clear'>) {
  return (
    <>
      {unavailable && ids.length > 0 && !held && (
        <p className="conv-note conv-context-status" role="status">
          {known ? 'Some selected members are unavailable.' : 'Selected members could not be verified.'}{' '}
          <button type="button" className="text-button" onClick={clear}>
            Clear mentions
          </button>
        </p>
      )}
    </>
  )
}
