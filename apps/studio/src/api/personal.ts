// The personal space (contract amendment A10): the person's own conversation with Sophia, their notes and the notes
// they carried, and the projects of their Work side. Reads are owner-only on the server; every write is idempotent
// per person and key: after no reply, retry with the SAME key. Receipts carry ids; read the space again for words.
import type {
  PersonalExport,
  PersonalNoteRequest,
  PersonalReceipt,
  PersonalSpace,
  PersonalTurnPage,
  ProjectList,
} from '@sophia/contracts'
import {
  parsePersonalExport,
  parsePersonalReceipt,
  parsePersonalSpace,
  parsePersonalTurnPage,
  parseProjectList,
} from '@sophia/contracts/validate'
import { callApi } from './client.ts'

const read = <T>(token: string, path: `/api/${string}`, parse: (value: unknown) => T) =>
  callApi(path, { token, method: 'GET' }, parse)

const write = (token: string, path: `/api/${string}`, key: string, body?: unknown): Promise<PersonalReceipt> =>
  callApi(path, { token, key, ...(body === undefined ? {} : { body }) }, parsePersonalReceipt)

export const getPersonalSpace = (token: string): Promise<PersonalSpace> =>
  read(token, '/api/v1/personal', parsePersonalSpace)

/** What a client waiting for Sophia polls: turns after `after`, and whether a reply is still pending. */
export const getPersonalTurns = (token: string, after: number): Promise<PersonalTurnPage> =>
  read(token, `/api/v1/personal/turns?after=${after}`, parsePersonalTurnPage)

export const exportPersonalSpace = (token: string): Promise<PersonalExport> =>
  read(token, '/api/v1/personal/export', parsePersonalExport)

export const listProjects = (token: string): Promise<ProjectList> => read(token, '/api/v1/projects', parseProjectList)

export const sendPersonalTurn = (token: string, key: string, text: string) =>
  write(token, '/api/v1/personal/turns', key, { text })

/** Back after a quiet spell: Sophia welcomes the person by `name`, if a welcome is due (turnId null if not). */
export const resumePersonalSpace = (token: string, key: string, name: string | null) =>
  write(token, '/api/v1/personal/resume', key, name ? { name } : {})

export const retryPersonalTurn = (token: string, key: string, turnId: string) =>
  write(token, `/api/v1/personal/turns/${turnId}/retry`, key)

export const decidePersonalSuggestion = (
  token: string,
  key: string,
  suggestionId: string,
  decision: 'keep' | 'dismiss',
) => write(token, `/api/v1/personal/suggestions/${suggestionId}/decision`, key, { decision })

export const keepPersonalNote = (token: string, key: string, note: PersonalNoteRequest) =>
  write(token, '/api/v1/personal/notes', key, note)

export const forgetPersonalNote = (token: string, key: string, noteId: string) =>
  write(token, `/api/v1/personal/notes/${noteId}/forget`, key)

export const carryPersonalNote = (token: string, key: string, noteId: string, projectId: string) =>
  write(token, `/api/v1/personal/notes/${noteId}/carry`, key, { projectId })

export const takeBackPersonalRelease = (token: string, key: string, releaseId: string) =>
  write(token, `/api/v1/personal/releases/${releaseId}/take-back`, key)

export const erasePersonalSpace = (token: string, key: string) =>
  write(token, '/api/v1/personal/erasure', key, { confirm: 'delete' })
