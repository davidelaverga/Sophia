// A project's saved text conversations (CON-01, contract amendment A16; the UI proposal vision.ts once named A18): the
// list with the saved-text policy and what the reader may do, a conversation's pages, starting one, a message, and
// withdrawing or erasing. Every answer is checked against the generated contract; a different answer is an error,
// never a cast. Served by the API only where conversations are on (SOPHIA_CONVERSATIONS); the fixture pages answer
// the same shapes.
import type {
  ConversationErasure,
  ConversationList,
  ConversationMessage,
  ConversationMessagePage,
  ConversationMessageSent,
  ConversationReply,
  ConversationSend,
  ConversationStart,
  ConversationStarted,
  ConversationSummary,
  ConversationWithdrawal,
} from '@sophia/contracts'
import {
  parseConversationErasure,
  parseConversationList,
  parseConversationMessagePage,
  parseConversationMessageSent,
  parseConversationStarted,
  parseConversationWithdrawal,
} from '@sophia/contracts/validate'
import { callApi } from './client.ts'

export type {
  ConversationList,
  ConversationMessage,
  ConversationReply,
  ConversationStarted,
  ConversationSummary,
  ConversationWithdrawal,
}

/** What starting a conversation sends: its question, its first message, and whether Sophia is asked. */
export type ConversationAsk = ConversationStart
/** What a message sends: its words, and whether Sophia is asked. */
export type MessageAsk = ConversationSend
/** A message recorded: the message, whether Sophia was asked, and the request her answer will settle. */
export type MessageSent = ConversationMessageSent
/** A page of a conversation's messages, oldest first; `before` reads the page before it. */
export type MessagePage = ConversationMessagePage

/** The project's conversations, newest activity first, with the policy and the reader's capability. */
export const listConversations = (token: string, projectId: string, signal?: AbortSignal) =>
  callApi(
    `/api/v1/projects/${projectId}/conversations`,
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    parseConversationList,
  )

/** A page of a conversation's messages: the newest, or those before `before`. */
export const getConversationMessages = (
  token: string,
  conversationId: string,
  before: string | null,
  signal?: AbortSignal,
) =>
  callApi(
    `/api/v1/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    { token, method: 'GET', ...(signal ? { signal } : {}) },
    parseConversationMessagePage,
  )

/** Start a conversation (writers), once per key. */
export const startConversation = (token: string, projectId: string, key: string, body: ConversationAsk) =>
  callApi(`/api/v1/projects/${projectId}/conversations`, { token, key, body }, parseConversationStarted)

/** A message in a conversation (writers), once per key. */
export const sendConversationMessage = (token: string, conversationId: string, key: string, body: MessageAsk) =>
  callApi(`/api/v1/conversations/${conversationId}/messages`, { token, key, body }, parseConversationMessageSent)

/** Withdraw a message (its author, or an admin), once per key. */
export const withdrawConversationMessage = (token: string, conversationId: string, messageId: string, key: string) =>
  callApi(
    `/api/v1/conversations/${conversationId}/messages/${messageId}/withdrawal`,
    { token, key },
    parseConversationWithdrawal,
  )

/** Erase a conversation (admins), once per key. */
export const eraseConversation = (token: string, conversationId: string, key: string): Promise<ConversationErasure> =>
  callApi(`/api/v1/conversations/${conversationId}/erasure`, { token, key }, parseConversationErasure)
