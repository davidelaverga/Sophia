// A save whose reply never came, or came unreadable (docs/plans/save-reply-lost.md): a network failure, the write's
// timeout, no reply (`outcome_unknown`), a 5xx, or a reply that broke the contract. It may have landed, so the caller
// reads what stands before saying anything. A refusal the API answered (a 4xx) is an answer, and keeps its words.
import { ApiError } from './client.ts'

export const replyLost = (err: unknown): boolean =>
  !(err instanceof ApiError) || err.status === 0 || err.status >= 500 || err.code === 'contract_violation'
