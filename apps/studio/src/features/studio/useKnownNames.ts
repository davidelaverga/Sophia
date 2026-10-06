// The names a room has known this visit (StudioShell, MeetingRecap): the participants' as they came and went.
import { useState } from 'react'
import type { ProjectRoom } from '../voice/useProjectRoom.ts'
import { mergeNames } from './side-panel.ts'

/** Names the room has known this visit, by identity, so a line keeps its author's name after they leave. */
export function useKnownNames(room: ProjectRoom): ReadonlyMap<string, string> {
  const [known, setKnown] = useState<ReadonlyMap<string, string>>(() => new Map())
  const merged = mergeNames(known, room.participants)
  if (merged !== known) setKnown(merged)
  return merged
}
