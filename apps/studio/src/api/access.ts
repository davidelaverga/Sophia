// Room access calls (contract amendment A02). An invitation link's token travels only in request bodies,
// never in a URL the API or a proxy could log; the Studio reads it from the link's fragment.
import type {
  Invitation,
  InvitationAccepted,
  InvitationCreate,
  InvitationList,
  InvitationPreview,
  LobbyEntry,
  Membership,
  RoomSession,
  RoomToken,
  SessionCreate,
} from '@sophia/contracts'
import {
  parseInvitation,
  parseInvitationAccepted,
  parseInvitationList,
  parseInvitationPreview,
  parseLobbyEntry,
  parseMembership,
  parseRoomSession,
  parseRoomToken,
} from '@sophia/contracts/validate'
import { callApi } from './client.ts'

export const createInvitation = (token: string, projectId: string, key: string, body: InvitationCreate) =>
  callApi<Invitation>(`/api/v1/projects/${projectId}/invitations`, { token, body, key }, parseInvitation)

export const listInvitations = (token: string, projectId: string) =>
  callApi<InvitationList>(`/api/v1/projects/${projectId}/invitations`, { token, method: 'GET' }, parseInvitationList)

export const reissueInvitation = (token: string, invitationId: string) =>
  callApi<Invitation>(`/api/v1/invitations/${invitationId}/reissue`, { token }, parseInvitation)

export const revokeInvitation = (token: string, invitationId: string) =>
  callApi<Invitation>(`/api/v1/invitations/${invitationId}/revoke`, { token }, parseInvitation)

/** Public: where a link leads and whether it is still open. */
export const previewInvitation = (linkToken: string) =>
  callApi<InvitationPreview>(
    '/api/v1/join/preview',
    { token: null, body: { token: linkToken } },
    parseInvitationPreview,
  )

export const knockRoom = (token: string, linkToken: string, displayName: string) =>
  callApi<LobbyEntry>('/api/v1/join/knock', { token, body: { token: linkToken, displayName } }, parseLobbyEntry)

export const acceptInvitation = (token: string, linkToken: string) =>
  callApi<InvitationAccepted>('/api/v1/join/accept', { token, body: { token: linkToken } }, parseInvitationAccepted)

export const getLobbyEntry = (token: string, entryId: string) =>
  callApi<LobbyEntry>(`/api/v1/lobby/${entryId}`, { token, method: 'GET' }, parseLobbyEntry)

export const issueGuestRoomToken = (token: string, entryId: string) =>
  callApi<RoomToken>(`/api/v1/lobby/${entryId}/room-token`, { token }, parseRoomToken)

export const decideLobbyEntry = (token: string, entryId: string, decision: 'admit' | 'deny') =>
  callApi<LobbyEntry>(`/api/v1/lobby/${entryId}/decision`, { token, body: { decision } }, parseLobbyEntry)

export const scheduleSession = (token: string, projectId: string, key: string, body: SessionCreate) =>
  callApi<RoomSession>(`/api/v1/projects/${projectId}/sessions`, { token, body, key }, parseRoomSession)

export const cancelSession = (token: string, sessionId: string) =>
  callApi<RoomSession>(`/api/v1/sessions/${sessionId}/cancel`, { token }, parseRoomSession)

export const getMembership = (token: string, projectId: string) =>
  callApi<Membership>(`/api/v1/projects/${projectId}/membership`, { token, method: 'GET' }, parseMembership)
