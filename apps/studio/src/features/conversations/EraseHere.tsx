// Erasing a conversation (CON-01, A16; binding map §6, owner D-3): an admin erases a whole conversation for everyone,
// its title and every message, and Sophia's answers in it. A quiet press at the foot of «This conversation» in the
// context; pressed, a short confirmation under it says what goes, and only its own press erases. One intent, one key:
// with no reply, the press sends it again under the same key. Erased, the conversation leaves the list at once (then
// the list is read again), its messages are let go, and the view lets go of what it kept for it. The focus is armed as
// Erase is pressed (the feed may take the conversation away first) and lands where the view says (useErased).
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ApiError } from '../../api/client.ts'
import { eraseConversation, type ConversationErasure, type ConversationList } from '../../api/conversations.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { focusLater } from '../personal/focus.ts'
import { LISTS, listKey } from './conversation-list.ts'
import { releasing, setListsData } from './list-data.ts'
import { useHeldWrite, type Held } from './held-write.ts'

/** Where an admin may erase: the project, who reads, where the focus lands, and what the view does once it is erased. */
export interface Erase {
  projectId: string
  identity: Identity
  arm: (conversationId: string, land: (el: HTMLElement | null) => void) => void
  onErased: (conversationId: string) => void
  /** Refused outright (never for no reply): a start's receipt held back for it may land (list-data `released`). */
  onRefused: (conversationId: string, err: ApiError) => void
  /** The erasure on its way, or sent with no reply, as the view keeps it for each conversation (talk-store.ts). */
  held: (conversationId: string) => Held<string> | null
  onHeld: (conversationId: string, next: Held<string> | null) => void
}

/** What a refused erasure says. */
export function eraseRefusal(err: ApiError): string {
  if (err.code === 'forbidden') return 'Only an admin erases a conversation.'
  if (err.code === 'not_found') return 'That conversation is no longer here.'
  return 'That didn’t go through. Try again.'
}

/** The list without one conversation. */
export const listWithout = (list: ConversationList | undefined, conversationId: string) =>
  list && { ...list, conversations: list.conversations.filter((c) => c.id !== conversationId) }

/** One conversation's erasure: its press (at the foot of «This conversation») and, pressed, its confirmation. */
export function useEraseHere(erase: Erase | null, conversationId: string): { press: ReactNode; form: ReactNode } {
  const [asking, setAsking] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const press = useRef<HTMLButtonElement>(null)
  const queryClient = useQueryClient()
  const write = useHeldWrite<string, ConversationErasure>(
    erase?.held(conversationId) ?? null,
    (next) => erase?.onHeld(conversationId, next),
    (key, id) => eraseConversation(erase?.identity.token ?? '', id, key),
    releasing({ words: refused, onWords: setRefused, say: eraseRefusal }, (err) =>
      erase?.onRefused(conversationId, err),
    ),
  )
  if (!erase) return { press: null, form: null }
  const close = () => {
    setAsking(false)
    requestAnimationFrame(() => press.current?.focus())
  }
  const go = async () => {
    erase.arm(conversationId, focusLater())
    const erased = await write.run(conversationId)
    if (!erased) return
    const account = accountOf(erase.identity)
    // Its data only: a list whose reads are failing still says so (PR #199 r4237298620).
    setListsData(
      queryClient,
      listKey(erase.projectId, account),
      (list) => listWithout(list, erased.conversationId) ?? list,
    )
    void queryClient.invalidateQueries({ queryKey: LISTS })
    // Settles it (ConversationsView): what is kept for it goes, its messages as read with it, the cached thread last.
    erase.onErased(erased.conversationId)
  }
  return {
    press: (
      <button
        ref={press}
        type="button"
        className="text-button conv-erase"
        aria-expanded={asking}
        onClick={() => setAsking(true)}
      >
        Erase this conversation
      </button>
    ),
    form: asking ? (
      <EraseConfirm
        busy={write.busy}
        unknown={write.unknown !== null}
        refused={refused}
        onConfirm={() => void go()}
        onKeep={close}
      />
    ) : null,
  }
}

/** What goes, said before it goes; Esc keeps the conversation, as «Keep it» does. */
function EraseConfirm(props: {
  busy: boolean
  unknown: boolean
  refused: string | null
  onConfirm: () => void
  onKeep: () => void
}) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus(), [])
  const said = props.unknown ? 'Not confirmed: Erase sends it again; it won’t be erased twice.' : props.refused
  return (
    <div
      className="conv-erase-form"
      role="group"
      aria-label="Erase this conversation"
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        e.stopPropagation()
        props.onKeep()
      }}
    >
      <p className="conv-note">
        Erase this conversation? Its title and every message leave it for everyone, and so do Sophia’s answers in it.
        This can’t be undone.
      </p>
      <div className="conv-compose-acts">
        <button
          ref={first}
          type="button"
          className="button"
          aria-disabled={props.busy || undefined}
          onClick={() => !props.busy && props.onConfirm()}
        >
          {props.busy ? 'Erasing…' : 'Erase'}
        </button>
        <button type="button" className="text-button" onClick={props.onKeep}>
          Keep it
        </button>
      </div>
      {said && (
        <p className="conv-note" role="alert">
          {said}
        </p>
      )}
    </div>
  )
}
