// Withdrawing a message (CON-01, A16; binding map §6): its author withdraws their own, an admin removes any. A small
// press at the message's corner, beside «Propose as decision», under the pointer or the focus as that one is; pressed, a
// short confirmation under the message says what goes, and only its own press withdraws. One intent, one key: with no
// reply, the press sends it again under the same key. Withdrawn, the message keeps its place and says so, and the
// conversation and the list are read again (her answers that read it go too, on the server). Its press and its
// confirmation go with its words: the focus lands on what the message says now, unless the person moved it elsewhere
// while the withdrawal was on its way (focusLater).
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Icon, Tip } from '@sophia/ui'
import type { ApiError } from '../../api/client.ts'
import {
  withdrawConversationMessage,
  type ConversationList,
  type ConversationMessage,
} from '../../api/conversations.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { focusLater } from '../personal/focus.ts'
import { LISTS, listWithdrawn, messagesKey, remainsAfter, withWithdrawn, type ReadPages } from './conversation-list.ts'
import { useHeldWrite, type Held } from './held-write.ts'

export interface WithdrawArgs {
  conversationId: string
  identity: Identity
  messageId: string
  /** The reader's own message (they withdraw it), else one an admin removes. */
  own: boolean
}

/** What a refused withdrawal says. */
export function withdrawRefusal(err: ApiError): string {
  if (err.code === 'forbidden') return 'That isn’t yours to withdraw.'
  if (err.code === 'not_found') return 'That message is no longer here.'
  return 'That didn’t go through. Try again.'
}

/** One message's withdrawal: its press (at the message's corner) and, pressed, its confirmation; null where none may. */
export function useWithdrawHere(args: WithdrawArgs | null): { press: ReactNode; form: ReactNode } {
  const [asking, setAsking] = useState(false)
  const [held, setHeld] = useState<Held<string> | null>(null)
  const [refused, setRefused] = useState<string | null>(null)
  const press = useRef<HTMLButtonElement>(null)
  const landing = useLanding(args === null)
  const queryClient = useQueryClient()
  const write = useHeldWrite<string, ConversationMessage>(
    held,
    setHeld,
    async (key, messageId) =>
      (await withdrawConversationMessage(args?.identity.token ?? '', args?.conversationId ?? '', messageId, key))
        .message,
    { words: refused, onWords: setRefused, say: withdrawRefusal },
  )
  if (!args) return { press: null, form: null }
  const close = () => {
    setAsking(false)
    requestAnimationFrame(() => press.current?.focus())
  }
  const go = async () => {
    // Armed as the press is made: the feed may show it withdrawn before its reply comes, taking this confirmation and
    // the press with its words (CX-0011). It lands only once the message shows withdrawn, and only on a focus left
    // where it was or dropped (focusLater); a refusal leaves the message, and so nothing to land on.
    landing.arm(focusLater(), press.current?.closest('li') ?? null)
    const message = await write.run(args.messageId)
    if (!message) return
    const pages = messagesKey(args.conversationId, accountOf(args.identity))
    // What it said, what was said from it, and who it says wrote there leave the screen now: not only once (and if)
    // it is read again.
    const before = queryClient.getQueryData<ReadPages<ConversationMessage>>(pages)
    const after = withWithdrawn(before, message)
    queryClient.setQueryData<ReadPages<ConversationMessage>>(pages, () => after)
    const remains = remainsAfter(before, after, message)
    queryClient.setQueriesData<ConversationList>({ queryKey: LISTS }, (list) =>
      listWithdrawn(list, args.conversationId, remains),
    )
    void queryClient.invalidateQueries({ queryKey: pages })
    void queryClient.invalidateQueries({ queryKey: LISTS })
    setAsking(false)
  }
  return {
    press: (
      <WithdrawPress press={press} label={args.own ? 'Withdraw message' : 'Remove message'} asking={asking}>
        {() => setAsking(true)}
      </WithdrawPress>
    ),
    form: asking ? (
      <WithdrawConfirm
        own={args.own}
        busy={write.busy}
        unknown={write.unknown !== null}
        refused={refused}
        onConfirm={() => void go()}
        onKeep={close}
      />
    ) : null,
  }
}

/** The press at the message's corner: its words in its name and its tip. */
function WithdrawPress(props: {
  press: RefObject<HTMLButtonElement | null>
  label: string
  asking: boolean
  children: () => void
}) {
  return (
    <span className="conv-withdraw">
      <button
        ref={props.press}
        type="button"
        className="conv-propose-press has-tip"
        aria-label={props.label}
        aria-expanded={props.asking}
        onClick={(e) => {
          e.stopPropagation()
          props.children()
        }}
      >
        <Icon name="close" />
        <Tip label={props.label} side="top" align="end" />
      </button>
    </span>
  )
}

/**
 * Where the focus goes once a withdrawal landed: on what the message says now, after the render that shows it withdrawn
 * (not before), whichever comes first, its reply or the feed's read showing it withdrawn (`gone`).
 */
function useLanding(gone: boolean) {
  const landing = useRef<{ land: (el: HTMLElement | null) => void; item: HTMLElement | null } | null>(null)
  const [armed, setArmed] = useState(0)
  useEffect(() => {
    const at = landing.current
    if (!gone || !at) return
    landing.current = null
    at.land(at.item?.querySelector<HTMLElement>('.conv-withdrawn') ?? null)
  }, [gone, armed])
  return {
    arm: (land: (el: HTMLElement | null) => void, item: HTMLElement | null) => {
      landing.current = { land, item }
      setArmed((n) => n + 1)
    },
  }
}

/** What goes, said before it goes; Esc keeps the message, as «Keep it» does. */
function WithdrawConfirm(props: {
  own: boolean
  busy: boolean
  unknown: boolean
  refused: string | null
  onConfirm: () => void
  onKeep: () => void
}) {
  const first = useRef<HTMLButtonElement>(null)
  useEffect(() => first.current?.focus(), [])
  const said = props.unknown ? 'Not confirmed: Withdraw sends it again; it won’t be withdrawn twice.' : props.refused
  return (
    <div
      className="conv-withdraw-form"
      role="group"
      aria-label={props.own ? 'Withdraw this message' : 'Remove this message'}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.preventDefault()
        props.onKeep()
      }}
    >
      <p className="conv-note">
        {props.own ? 'Withdraw this message?' : 'Remove this message?'} Its words leave this conversation for everyone,
        and so do Sophia’s answers that read it. This can’t be undone.
      </p>
      <div className="conv-compose-acts">
        <button
          ref={first}
          type="button"
          className="button"
          aria-disabled={props.busy || undefined}
          onClick={() => !props.busy && props.onConfirm()}
        >
          {props.busy ? 'Withdrawing…' : props.own ? 'Withdraw' : 'Remove'}
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
