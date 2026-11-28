import { useState, type ReactNode } from 'react'
import type { ProjectMember } from '@sophia/contracts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { MentionPicker, useMemberNames } from '../conversation/MentionPicker.tsx'
import { labelOf, nameable, toggled } from '../conversation/mention-view.ts'
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
  unavailable: boolean
  clear: () => void
  toggle: (id: string) => void
}): ReactNode {
  const [open, setOpen] = useState(false)
  const { ids, options, held, unavailable, clear, toggle } = props
  if (held) {
    if (ids.length === 0) return null
    const names = options.filter((member) => ids.includes(member.actorId)).map(labelOf)
    return (
      <p className="conv-note">
        {unavailable ? 'The original mentions will be kept on retry.' : `Mentions ${names.join(', ')}`}
      </p>
    )
  }
  return (
    <>
      {unavailable && (
        <p className="conv-note" role="status">
          Some selected members are unavailable.{' '}
          <button type="button" className="text-button" onClick={clear}>
            Clear mentions
          </button>
        </p>
      )}
      {options.length > 0 && (
        <MentionPicker options={options} chosen={ids} toggle={toggle} open={open} setOpen={setOpen} />
      )}
    </>
  )
}
