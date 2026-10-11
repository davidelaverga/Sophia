// Runtime validation of what a client reads from the Sophia API (published as "@sophia/contracts/validate").
// Browser-safe: the validators are generated ahead of time (scripts/generate-validators.ts), so there is
// no Ajv compiler and no eval at runtime. A body that breaks the contract throws; it is never cast.
import type { ErrorObject, ValidateFunction } from 'ajv'
import {
  validateContributionReceipt,
  validateCursorAdvance,
  validateError,
  validateEvent,
  validateExchangeReceipt,
  validateExchangeState,
  validateInvitation,
  validateInvitationAccepted,
  validateInvitationList,
  validateInvitationPreview,
  validateLobbyEntry,
  validateMediaAssignmentBatch,
  validateMediaToolResult,
  validateMediaToolSurface,
  validateMembership,
  validateMissionContext,
  validateMissionNotePolicy,
  validateMissionReceipt,
  validateMissionWithdrawalPreview,
  validateSourceContent,
  validateArtifactVersionList,
  validateReportList,
  validateReportSourceList,
  validateReportSummary,
  validateResearchRendition,
  validateNativeTaskDetail,
  validateNativeTaskReceipt,
  validatePersonalEarlierTurns,
  validatePersonalExport,
  validatePersonalReceipt,
  validatePersonalSpace,
  validatePersonalTurnPage,
  validateProjectCreated,
  validateProjectList,
  validateWorkBoardView,
  validateWorkReceipt,
  validateWorkResult,
  validateSourceReviewProposal,
  validateSourceReviewAvailability,
  validateReceipt,
  validateRoomSession,
  validateRoomToken,
  validateSnapshot,
  validateNeedList,
} from './generated/validators.js'
import type { CursorAdvance, Error as ErrorBody, Event } from './generated-types.ts'

/** A value from the wire that does not match the contract schema it was read as. */
export class ContractViolation extends Error {
  readonly schema: string
  readonly issues: string

  constructor(schema: string, issues: string) {
    super(`Response does not match ${schema}: ${issues}`)
    this.name = 'ContractViolation'
    this.schema = schema
    this.issues = issues
  }
}

const describe = (errors: ErrorObject[] | null | undefined) =>
  (errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? e.keyword}`).join('; ') || 'invalid'

function parser<T>(schema: string, validate: ValidateFunction<T>): (value: unknown) => T {
  return (value) => {
    if (validate(value)) return value
    throw new ContractViolation(schema, describe(validate.errors))
  }
}

export const parseSnapshot = parser('Snapshot', validateSnapshot)
export const parseReceipt = parser('Receipt', validateReceipt)
export const parseProjectCreated = parser('ProjectCreated', validateProjectCreated)
export const parseEvent = parser('Event', validateEvent)
export const parseCursorAdvance = parser('CursorAdvance', validateCursorAdvance)
export const parseRoomToken = parser('RoomToken', validateRoomToken)
export const parseExchangeReceipt = parser('ExchangeReceipt', validateExchangeReceipt)
export const parseInvitation = parser('Invitation', validateInvitation)
export const parseInvitationList = parser('InvitationList', validateInvitationList)
export const parseInvitationPreview = parser('InvitationPreview', validateInvitationPreview)
export const parseInvitationAccepted = parser('InvitationAccepted', validateInvitationAccepted)
export const parseLobbyEntry = parser('LobbyEntry', validateLobbyEntry)
export const parseRoomSession = parser('RoomSession', validateRoomSession)
export const parseMembership = parser('Membership', validateMembership)
export const parseContributionReceipt = parser('ContributionReceipt', validateContributionReceipt)
export const parseNativeTaskReceipt = parser('NativeTaskReceipt', validateNativeTaskReceipt)
export const parseNativeTaskDetail = parser('NativeTaskDetail', validateNativeTaskDetail)
export const parseExchangeState = parser('ExchangeState', validateExchangeState)
export const parseMediaAssignmentBatch = parser('MediaAssignmentBatch', validateMediaAssignmentBatch)
export const parseMediaToolResult = parser('MediaToolResult', validateMediaToolResult)
export const parseMediaToolSurface = parser('MediaToolSurface', validateMediaToolSurface)
export const parseMissionContext = parser('MissionContext', validateMissionContext)
export const parseMissionReceipt = parser('MissionReceipt', validateMissionReceipt)
export const parseMissionNotePolicy = parser('MissionNotePolicy', validateMissionNotePolicy)
export const parseMissionWithdrawalPreview = parser('MissionWithdrawalPreview', validateMissionWithdrawalPreview)
export const parseSourceContent = parser('SourceContent', validateSourceContent)
export const parseArtifactVersionList = parser('ArtifactVersionList', validateArtifactVersionList)
export const parseReportList = parser('ReportList', validateReportList)
export const parseReportSourceList = parser('ReportSourceList', validateReportSourceList)
export const parseReportSummary = parser('ReportSummary', validateReportSummary)
export const parseResearchRendition = parser('ResearchRendition', validateResearchRendition)
export const parsePersonalSpace = parser('PersonalSpace', validatePersonalSpace)
export const parsePersonalTurnPage = parser('PersonalTurnPage', validatePersonalTurnPage)
export const parsePersonalEarlierTurns = parser('PersonalEarlierTurns', validatePersonalEarlierTurns)
export const parsePersonalExport = parser('PersonalExport', validatePersonalExport)
export const parsePersonalReceipt = parser('PersonalReceipt', validatePersonalReceipt)
export const parseProjectList = parser('ProjectList', validateProjectList)
export const parseNeedList = parser('NeedList', validateNeedList)
export const parseWorkBoardView = parser('WorkBoardView', validateWorkBoardView)
export const parseWorkReceipt = parser('WorkReceipt', validateWorkReceipt)
export const parseWorkResult = parser('WorkResult', validateWorkResult)
export const parseSourceReviewProposal = parser('SourceReviewProposal', validateSourceReviewProposal)
export const parseSourceReviewAvailability = parser('SourceReviewAvailability', validateSourceReviewAvailability)

/** An error body when the reply is one, else null: callers fall back to the HTTP status. */
export function asErrorBody(value: unknown): ErrorBody | null {
  return validateError(value) ? value : null
}

/** One event-stream frame. `cursor.advanced` is reserved for hidden events; everything else is an Event. */
export function parseFrame(value: unknown): Event | CursorAdvance {
  const isAdvance = typeof value === 'object' && value !== null && 'type' in value && value.type === 'cursor.advanced'
  return isAdvance ? parseCursorAdvance(value) : parseEvent(value)
}

/** Narrow a frame without a cast: after `if (isCursorAdvance(f)) …`, `f` is an Event. */
export function isCursorAdvance(frame: Event | CursorAdvance): frame is CursorAdvance {
  return frame.type === 'cursor.advanced'
}
