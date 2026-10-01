// The personal space (contract amendment A10): the person's own conversation with Sophia, their notes and the notes
// they carried, and the projects of their Work side. Reads are owner-only on the server; every write is idempotent
// per person and key: after no reply, retry with the SAME key. Every write but erasure names the epoch of the space it
// is made against: one from before an erasure is refused (request_erased). Receipts carry ids; read the space again
// for words.
import type {
  PersonalEarlierTurns,
  PersonalExport,
  PersonalNoteRequest,
  PersonalReceipt,
  PersonalSpace,
  PersonalTurnPage,
  ProjectList,
} from '@sophia/contracts'
import {
  parsePersonalEarlierTurns,
  parsePersonalExport,
  parsePersonalReceipt,
  parsePersonalSpace,
  parsePersonalTurnPage,
  parseProjectList,
} from '@sophia/contracts/validate'
import { callApi } from './client.ts'

const read = <T>(token: string, path: `/api/${string}`, parse: (value: unknown) => T) =>
  callApi(path, { token, method: 'GET' }, parse)

const write = (
  token: string,
  path: `/api/${string}`,
  key: string,
  epoch: number | null,
  body?: unknown,
): Promise<PersonalReceipt> =>
  callApi(
    path,
    {
      token,
      key,
      ...(epoch === null ? {} : { headers: { 'x-sophia-personal-epoch': String(epoch) } }),
      ...(body === undefined ? {} : { body }),
    },
    parsePersonalReceipt,
  )

/** The space, its `days` counted in `timeZone` (an IANA name; UTC without one). */
export const getPersonalSpace = (token: string, timeZone: string | null): Promise<PersonalSpace> =>
  read(
    token,
    timeZone ? `/api/v1/personal?timeZone=${encodeURIComponent(timeZone)}` : '/api/v1/personal',
    parsePersonalSpace,
  )

/** A long conversation read back: the page of turns before `before` (a seq), and whether earlier ones exist. */
export const getEarlierPersonalTurns = (token: string, before: number): Promise<PersonalEarlierTurns> =>
  read(token, `/api/v1/personal/turns/earlier?before=${String(before)}`, parsePersonalEarlierTurns)

/** What a client waiting for Sophia polls: turns after `after`, and whether a reply is still pending. */
export const getPersonalTurns = (token: string, after: number): Promise<PersonalTurnPage> =>
  read(token, `/api/v1/personal/turns?after=${after}`, parsePersonalTurnPage)

/** One page of the export: the turns after `after` (a seq), and `next` where the following page starts. */
const exportPage = (token: string, after: number): Promise<PersonalExport> =>
  read(token, `/api/v1/personal/export?after=${String(after)}`, parsePersonalExport)

/**
 * Everything the personal space keeps, read a page at a time (A10 bounds each): the first page's date, notes and carried
 * notes, with every page's turns, in order.
 */
export async function exportPersonalSpace(token: string): Promise<PersonalExport> {
  const first = await exportPage(token, 0)
  const turns = [...first.turns]
  let next = first.next
  while (next !== null) {
    const page = await exportPage(token, next)
    turns.push(...page.turns)
    next = page.next
  }
  return { ...first, turns, next: null }
}

export const listProjects = (token: string): Promise<ProjectList> => read(token, '/api/v1/projects', parseProjectList)

export const sendPersonalTurn = (token: string, key: string, epoch: number, text: string) =>
  write(token, '/api/v1/personal/turns', key, epoch, { text })

/** Back after a quiet spell: Sophia welcomes the person by `name`, if a welcome is due (turnId null if not). */
export const resumePersonalSpace = (token: string, key: string, epoch: number, name: string | null) =>
  write(token, '/api/v1/personal/resume', key, epoch, name ? { name } : {})

export const retryPersonalTurn = (token: string, key: string, epoch: number, turnId: string) =>
  write(token, `/api/v1/personal/turns/${turnId}/retry`, key, epoch)

export const decidePersonalSuggestion = (
  token: string,
  key: string,
  epoch: number,
  suggestionId: string,
  decision: 'keep' | 'dismiss',
) => write(token, `/api/v1/personal/suggestions/${suggestionId}/decision`, key, epoch, { decision })

export const keepPersonalNote = (token: string, key: string, epoch: number, note: PersonalNoteRequest) =>
  write(token, '/api/v1/personal/notes', key, epoch, note)

export const forgetPersonalNote = (token: string, key: string, epoch: number, noteId: string) =>
  write(token, `/api/v1/personal/notes/${noteId}/forget`, key, epoch)

export const carryPersonalNote = (token: string, key: string, epoch: number, noteId: string, projectId: string) =>
  write(token, `/api/v1/personal/notes/${noteId}/carry`, key, epoch, { projectId })

export const takeBackPersonalRelease = (token: string, key: string, epoch: number, releaseId: string) =>
  write(token, `/api/v1/personal/releases/${releaseId}/take-back`, key, epoch)

/** Never fenced: erasing writes nothing back, and its retry gets its receipt after the epoch moved. */
export const erasePersonalSpace = (token: string, key: string) =>
  write(token, '/api/v1/personal/erasure', key, null, { confirm: 'delete' })
