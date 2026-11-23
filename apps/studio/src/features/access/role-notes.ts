// What the members' rows say after a role change lands (docs/plans/focus-kept.md, «Saved»): «Saved» beside the select
// that changed, for a moment, and no refusal left from before on any row, since the roles it spoke of have moved.

/** What a row says: a refusal as an alert, a change landed (or found landed) as a status. */
export interface RowNote {
  text: string
  polite?: boolean
  /** A Saved, under the select that changed. */
  saved?: boolean
}

/** Said under a select whose change landed, then gone (SAVED_MS): one per save, so a later save's outlives the first. */
export const savedNote = (): RowNote => ({ text: 'Saved', polite: true, saved: true })
export const SAVED_MS = 2_500

/** The rows' notes once `actorId`'s change landed: theirs says `note`; every refusal goes; other statuses stay. */
export function afterSave(notes: ReadonlyMap<string, RowNote>, actorId: string, note: RowNote): Map<string, RowNote> {
  const next = new Map([...notes].filter(([, n]) => n.polite === true))
  next.set(actorId, note)
  return next
}

/** The notes once a Saved has had its moment: only that very note goes, whatever was said since stays. */
export function savedGone(notes: ReadonlyMap<string, RowNote>, actorId: string, note: RowNote) {
  if (notes.get(actorId) !== note) return notes
  const next = new Map(notes)
  next.delete(actorId)
  return next
}
