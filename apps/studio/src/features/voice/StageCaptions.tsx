// Captions on the stage (docs/plans/room-stage-captions.md): the last two things said, on the stage's axis just above
// the dock, while the Chat panel (which holds them all) is closed. A visual copy of the chat's captions, so hidden from
// assistive tech: Sophia's line stays the room's announced state.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CaptionTurn } from '../conversation/captions.ts'
import { authorLabel } from '../conversation/conversation-view.ts'
import { shortName } from './room-view.ts'
import { CAPTION_HOLD_MS, newSince, saidKey, saidSoFar, stageCaptions, type StageCaption } from './stage-captions.ts'
import type { ProjectRoom } from './useProjectRoom.ts'

/**
 * The captions the stage may show: while anything is being said, and until the hold passes after the last word or
 * end. Then they go, and only what is said after that comes back. Kept by a component that stays mounted, so the
 * hold runs while the stage doesn't show them (Chat open, out of the call): old words never return as new.
 */
function useHeldCaptions(turns: readonly CaptionTurn[]): readonly CaptionTurn[] {
  const said = saidKey(saidSoFar(turns))
  const [gone, setGone] = useState<{ key: string; said: ReadonlyMap<string, string> } | null>(null)
  useEffect(() => {
    if (!said) return undefined
    const t = window.setTimeout(() => setGone({ key: said, said: saidSoFar(turns) }), CAPTION_HOLD_MS)
    return () => window.clearTimeout(t)
  }, [said, turns])
  if (!said || gone?.key === said) return []
  return newSince(turns, gone?.said ?? null)
}

/**
 * The stage's captions, or null: none outside the call or while Chat is open (it holds them). `me` and `names` name a
 * member the chat's way, shortened to a first name as the stage names people.
 */
export function useStageCaptions(
  room: Pick<ProjectRoom, 'captions' | 'status'>,
  chatOpen: boolean,
  me: string,
  names: ReadonlyMap<string, string>,
): ReactNode {
  const held = useHeldCaptions(room.captions)
  const inCall = room.status === 'live' || room.status === 'reconnecting'
  if (!inCall || chatOpen) return null
  const label = (actorId: string) =>
    actorId !== me && names.has(actorId) ? shortName(names.get(actorId) ?? '') : authorLabel(actorId, me, names)
  const shown = stageCaptions(held, label)
  return shown.length > 0 ? <StageCaptions shown={shown} /> : null
}

/** Its height on the stage (`--captions-h`), for the video and the lens body to end above it. */
function useHeightOnStage() {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    const stage = el?.closest<HTMLElement>('.room-stage')
    if (!el || !stage) return undefined
    // Written on the next frame, and only when it changed: the video and the lens body it moves are watched too.
    let frame = 0
    const sized = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const height = `${String(el.offsetHeight)}px`
        if (stage.style.getPropertyValue('--captions-h') !== height) stage.style.setProperty('--captions-h', height)
      })
    })
    sized.observe(el)
    return () => {
      cancelAnimationFrame(frame)
      sized.disconnect()
      stage.style.removeProperty('--captions-h')
    }
  }, [])
  return box
}

function StageCaptions({ shown }: { shown: readonly StageCaption[] }) {
  const box = useHeightOnStage()
  return (
    <div ref={box} className="stage-captions" aria-hidden="true">
      {shown.map((c) => (
        <p
          key={c.id}
          className="stage-caption"
          data-speaker={c.sophia ? 'sophia' : 'member'}
          data-said={c.said}
          data-older={c.older ? '' : undefined}
        >
          <span className="caption-who">{c.who}</span>
          <span className="caption-words">{c.words}</span>
        </p>
      ))}
    </div>
  )
}
