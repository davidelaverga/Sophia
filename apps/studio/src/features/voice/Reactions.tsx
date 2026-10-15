// Reactions on the room's stage (docs/plans/call-reactions.md): each floats up with who sent it for a few seconds, in a
// polite live log a screen reader says as «Marco reacted Clap».
import { shortName } from './room-view.ts'
import { reactionName, type Reaction } from './reactions.ts'

export function Reactions({ shown }: { shown: readonly Reaction[] }) {
  return (
    <ol className="reactions" role="log" aria-label="Reactions" aria-live="polite">
      {shown.map((r) => (
        <li key={r.id} className="reaction">
          <span className="reaction-emoji" aria-hidden>
            {r.emoji}
          </span>{' '}
          <span>{r.local ? r.name : shortName(r.name)}</span>
          <span className="sr-only">{` reacted ${reactionName(r.emoji)}`}</span>
        </li>
      ))}
    </ol>
  )
}
