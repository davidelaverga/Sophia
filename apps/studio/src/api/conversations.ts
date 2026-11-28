// A project's saved text conversations (CON-01, contract amendment A33; the UI proposal vision.ts once named A18): the
// list with the saved-text policy and what the reader may do, a conversation's pages, starting one, a message, and
// withdrawing or erasing. Every answer is checked against the generated contract; a different answer is an error,
// never a cast. Served by the API only where conversations are on (SOPHIA_CONVERSATIONS); the fixture pages answer
// the same shapes.
import type {
  AddressedConversationInputSend,
  AddressedConversationInputStart,
  ConversationErasure,
  ConversationInputRecorded,
  ConversationInputStarted,
  ConversationList,
  ConversationMessage,
  ConversationMessagePage,
  ConversationMessageSent,
  ConversationReply,
  ConversationSend,
  ConversationStart,
  ConversationStarted as LegacyConversationStarted,
  ConversationSummary,
  ConversationWithdrawal,
} from '@sophia/contracts'
import {
  parseConversationArtifactVersion,
  parseConversationErasure,
  parseConversationInputRecorded,
  parseConversationInputStarted,
  parseConversationList,
  parseConversationMessagePage,
  parseConversationMessageSent,
  parseConversationStarted,
  parseConversationWithdrawal,
} from '@sophia/contracts/validate'
import { callApi } from './client.ts'

export type {
  ConversationErasure,
  ConversationList,
  ConversationMessage,
  ConversationReply,
  ConversationSummary,
  ConversationWithdrawal,
}

/** A held write keeps its selected contract through retries and reloads. */
interface WriteAddressing {
  addressingVersion?: 1
  mentions?: readonly string[]
  artifactVersionId?: string
}

export type ConversationAsk = ConversationStart & WriteAddressing
export type MessageAsk = ConversationSend & WriteAddressing & { replyToMessageId?: string | null }
export type ConversationStarted = LegacyConversationStarted | (ConversationInputStarted & { reply: null })
export type MessageSent = ConversationMessageSent | (ConversationInputRecorded & { reply: null })
/** A page of a conversation's messages, oldest first; `before` reads the page before it. */
export type MessagePage = ConversationMessagePage

/** The project's conversations, newest activity first, with the policy and the reader's capability. */
export const listConversations = (token: string, projectId: string, signal?: AbortSignal) =>
  callApi(
    `/api/v1/projects/${projectId}/conversations`,
    { token, method: 'GET', protectedRead: true, ...(signal ? { signal } : {}) },
    parseConversationList,
  )

/**
 * A page of a conversation's messages, read within its project (A33 getProjectConversationMessages): the newest, or
 * those before `before`. In one snapshot: a reader not a current member of the project is refused (403 `forbidden`)
 * before anything of the conversation is read; to a member, `not_found` (422) is none open in this project (erased,
 * missing or another project's alike: not proof of an erasure). The Studio reads a transcript only this way.
 */
export const getConversationMessages = (
  token: string,
  projectId: string,
  conversationId: string,
  before: string | null,
  signal?: AbortSignal,
) =>
  callApi(
    `/api/v1/projects/${projectId}/conversations/${conversationId}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    { token, method: 'GET', protectedRead: true, ...(signal ? { signal } : {}) },
    parseConversationMessagePage,
  )

/** The exact published version a project member can attach to a new conversation. */
export const getConversationArtifactVersion = (
  token: string,
  projectId: string,
  versionId: string,
  signal: AbortSignal,
) =>
  callApi(
    `/api/v1/projects/${projectId}/conversation-artifact-versions/${versionId}`,
    { token, method: 'GET', protectedRead: true, signal },
    parseConversationArtifactVersion,
  )

/** Start a conversation (writers), once per key. */
export async function startConversation(
  token: string,
  projectId: string,
  key: string,
  { title, text, askSophia, addressingVersion, mentions = [], artifactVersionId }: ConversationAsk,
): Promise<ConversationStarted> {
  const project = `/api/v1/projects/${projectId}` as const
  if (addressingVersion === 1) {
    const body = {
      interactionContract: 'automatic_v1',
      addressingVersion,
      title,
      text,
      mentions,
      ...(artifactVersionId ? { artifactVersionId } : {}),
    } satisfies AddressedConversationInputStart
    const saved = await callApi(
      `${project}/conversation-inputs/addressed`,
      { token, key, body },
      parseConversationInputStarted,
    )
    return { ...saved, reply: null }
  }
  return callApi(`${project}/conversations`, { token, key, body: { title, text, askSophia } }, parseConversationStarted)
}

/** A message in a conversation (writers), once per key. */
export async function sendConversationMessage(
  token: string,
  conversationId: string,
  key: string,
  { text, askSophia, addressingVersion, replyToMessageId = null, mentions = [], artifactVersionId }: MessageAsk,
): Promise<MessageSent> {
  const conversation = `/api/v1/conversations/${conversationId}` as const
  if (addressingVersion === 1) {
    const body = {
      interactionContract: 'automatic_v1',
      addressingVersion,
      text,
      mentions,
      replyToMessageId,
      ...(artifactVersionId ? { artifactVersionId } : {}),
    } satisfies AddressedConversationInputSend
    const saved = await callApi(
      `${conversation}/inputs/addressed`,
      { token, key, body },
      parseConversationInputRecorded,
    )
    return { ...saved, reply: null }
  }
  return callApi(`${conversation}/messages`, { token, key, body: { text, askSophia } }, parseConversationMessageSent)
}

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
