// The rows of the room's messages on their way (chat-pace.md): the one going now, and each refused one the bar couldn't
// take back. What the discussion holds, or held once, is drawn there alone; while one goes, a new entry of this
// person's with its words (one the discussion didn't hold when the send began) is it, brought by the feed first.
import { useState } from 'react'
import type { Snapshot } from '@sophia/contracts'
import { landedNow, pendingOf } from './pending-message.ts'
import type { PendingRow } from './PendingMessage.tsx'
import type { useRoomMessage } from './useRoomMessage.ts'

export function usePendingRows(
  toRoom: ReturnType<typeof useRoomMessage>,
  snapshot: Pick<Snapshot, 'discussion'> | undefined,
  me: string | null,
): PendingRow[] {
  const { admission, failed, send } = toRoom
  const discussion = snapshot?.discussion ?? []
  const ids = new Set(discussion.map((e) => e.id))
  // What the discussion held when the send under way began, as the render first saw it go.
  const going = admission.status === 'sending'
  const [before, setBefore] = useState<ReadonlySet<string> | null>(null)
  if (going && before === null) setBefore(ids)
  if (!going && before !== null) setBefore(null)
  const [landed, setLanded] = useState<string | null>(null)
  const nowLanded = landedNow(admission, { ids, landed })
  if (nowLanded !== landed) setLanded(nowLanded)
  const saidSince = (text: string) =>
    me !== null && before !== null && discussion.some((e) => e.actorId === me && e.text === text && !before.has(e.id))
  const current = pendingOf(admission, { ids, landed: nowLanded, saidSince })
  const rows: PendingRow[] = failed.map((message, i) => ({
    key: `failed-${String(i)}-${message.text}`,
    pending: { text: message.text, status: 'failed', id: null },
    onRetry: () => void send(message),
  }))
  if (current) rows.push({ key: 'current', pending: current, onRetry: () => void send() })
  return rows
}
