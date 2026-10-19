// The idempotency keys of archiving and bringing back (A30; Codex on #368): one per account, project and choice while
// that write has no answer, kept by the page rather than by what pressed it, so the sheet put away and opened again, or
// Work's Unarchive pressed again, after no reply sends the same write and never a second. Answered, landed or refused,
// the key goes (api/README: kept for a retry after an unknown outcome, discarded once the server answers), as a held
// write's does (held-write.ts). A choice that lands also lets go of the other choice's unanswered key: that write is
// moot now, and its key replayed later would be answered with its old receipt and change nothing (the server keeps
// receipts with no end), while a new key is always safe, as asking for the state the project has changes nothing.
// Shaped like removal-keys.ts.
import { ApiError } from '../../api/client.ts'

/** One choice: archiving a project (archived), or bringing it back, as one account. */
export interface ArchiveChoice {
  account: string
  projectId: string
  archived: boolean
}

export interface ArchiveKeys {
  /** The key for this choice now: the one still unanswered, else a new one. */
  keyFor: (choice: ArchiveChoice) => string
  /**
   * The write was answered (`failure` absent: it landed, and the other choice's key goes too). Its key goes, unless the
   * failure was no reply.
   */
  settled: (choice: ArchiveChoice, failure?: unknown) => void
}

/** No reply, or one that couldn't be read: the write may have landed, so a retry carries the same key. */
const unanswered = (failure: unknown) => !(failure instanceof ApiError) || failure.retry === 'same_admission_key'

/** Each field whole, so no account or project id can run into the next. */
const at = (c: ArchiveChoice) => JSON.stringify([c.account, c.projectId, c.archived])

export function archiveKeys(newKey: () => string = () => crypto.randomUUID()): ArchiveKeys {
  const keys = new Map<string, string>()
  return {
    keyFor: (choice) => {
      const key = keys.get(at(choice)) ?? newKey()
      keys.set(at(choice), key)
      return key
    },
    settled: (choice, failure) => {
      if (failure === undefined) keys.delete(at({ ...choice, archived: !choice.archived }))
      if (failure === undefined || !unanswered(failure)) keys.delete(at(choice))
    },
  }
}
