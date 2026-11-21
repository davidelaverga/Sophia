// Others' raised hands, said to a screen reader (docs/plans/hand-and-sync-announced.md): one polite line out of sight
// for the whole call, mounted once where the call lives (the project's shell; a guest's room), so it speaks on every
// view, the call in the header's dock included. There before it speaks (a live region added with its words is often
// not read), it never takes the focus; each turn is a new node, so the same words said again are read again.
import type { HandSaid } from './useProjectRoom.ts'

export function HandSaidLine({ said }: { said: HandSaid | null }) {
  return (
    <p className="hand-said sr-only" role="status">
      {said && <span key={said.turn}>{said.line}</span>}
    </p>
  )
}
