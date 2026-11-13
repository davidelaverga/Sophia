// Runtime validation of what a client reads from the Sophia API (published as "@sophia/contracts/validate").
// A property the contract doesn't list is dropped, not refused: a client built before an additive amendment reads
// a newer API as the shape it knows (docs/plans/tolerant-readers.md). Anything else off the contract is refused.
// Browser-safe: the validators are generated ahead of time (scripts/generate-validators.ts), so there is
// no Ajv compiler and no eval at runtime. A body that breaks the contract throws; it is never cast.
import type { ErrorObject, ValidateFunction } from 'ajv'
import {
  validateContributionActPreview,
  validateContributionActReceipt,
  validateContributionReceipt,
  validateCursorAdvance,
  validateError,
  validateEvent,
  validateExchangeReceipt,
  validateExchangeState,
  validateInvitation,
  validateInvitationAccepted,
  validateInvitationList,
  validatePendingInvitationList,
  validateInvitationPreview,
  validateLobbyEntry,
  validateMediaAssignmentBatch,
  validateMediaEvidenceAck,
  validateMediaQualificationReservation,
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
  validateProjectRenamed,
  validateProjectArchived,
  validateProjectLeft,
  validateDiscussionPage,
  validateGoalTargetList,
  validateGoalTargetSet,
  validateProjectMembers,
  validateInvitablePeople,
  validateMemberRoleSet,
  validateActivityPage,
  validateMemberRemoved,
  validateProfile,
  validateProjectUpdates,
  validateProjectList,
  validateWorkBoardView,
  validateWorkReceipt,
  validateWorkResult,
  validateSourceReviewProposal,
  validateSourceReviewAvailability,
  validateConversationList,
  validateConversationMessagePage,
  validateConversationStarted,
  validateConversationMessageSent,
  validateConversationWithdrawal,
  validateConversationErasure,
  validateDesignEditReceipt,
  validateDesignRetryReceipt,
  validateReceipt,
  validateRoomSession,
  validateRoomToken,
  validateSnapshot,
  validateNeedList,
  validateSearchPage,
  validateProjectTask,
  validateProjectTaskList,
  validateProjectNativeResourcePage,
  validatePersonalAnswerReceipt,
  validatePersonalAnswerDecisionList,
  validatePersonalAnswerControlReceipt,
  validatePersonalAnswerControlView,
  validatePersonalAnswerControlLog,
  validatePersonalControlledTurnPage,
  validatePersonalControlledExport,
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
export const parseProjectRenamed = parser('ProjectRenamed', validateProjectRenamed)
export const parseProjectArchived = parser('ProjectArchived', validateProjectArchived)
export const parseProjectLeft = parser('ProjectLeft', validateProjectLeft)
export const parseDiscussionPage = parser('DiscussionPage', validateDiscussionPage)
export const parseGoalTargetList = parser('GoalTargetList', validateGoalTargetList)
export const parseGoalTargetSet = parser('GoalTargetSet', validateGoalTargetSet)
export const parseProjectMembers = parser('ProjectMembers', validateProjectMembers)
export const parseInvitablePeople = parser('InvitablePeople', validateInvitablePeople)
export const parseMemberRoleSet = parser('MemberRoleSet', validateMemberRoleSet)
export const parseActivityPage = parser('ActivityPage', validateActivityPage)
export const parseMemberRemoved = parser('MemberRemoved', validateMemberRemoved)
export const parseProfile = parser('Profile', validateProfile)
export const parseProjectUpdates = parser('ProjectUpdates', validateProjectUpdates)
export const parseEvent = parser('Event', validateEvent)
export const parseCursorAdvance = parser('CursorAdvance', validateCursorAdvance)
export const parseRoomToken = parser('RoomToken', validateRoomToken)
export const parseExchangeReceipt = parser('ExchangeReceipt', validateExchangeReceipt)
export const parseInvitation = parser('Invitation', validateInvitation)
export const parseInvitationList = parser('InvitationList', validateInvitationList)
export const parsePendingInvitationList = parser('PendingInvitationList', validatePendingInvitationList)
export const parseInvitationPreview = parser('InvitationPreview', validateInvitationPreview)
export const parseInvitationAccepted = parser('InvitationAccepted', validateInvitationAccepted)
export const parseLobbyEntry = parser('LobbyEntry', validateLobbyEntry)
export const parseRoomSession = parser('RoomSession', validateRoomSession)
export const parseMembership = parser('Membership', validateMembership)
export const parseContributionReceipt = parser('ContributionReceipt', validateContributionReceipt)
export const parseContributionActPreview = parser('ContributionActPreview', validateContributionActPreview)
export const parseContributionActReceipt = parser('ContributionActReceipt', validateContributionActReceipt)
export const parseNativeTaskReceipt = parser('NativeTaskReceipt', validateNativeTaskReceipt)
export const parseNativeTaskDetail = parser('NativeTaskDetail', validateNativeTaskDetail)
export const parseExchangeState = parser('ExchangeState', validateExchangeState)
export const parseMediaAssignmentBatch = parser('MediaAssignmentBatch', validateMediaAssignmentBatch)
export const parseMediaToolResult = parser('MediaToolResult', validateMediaToolResult)
export const parseMediaToolSurface = parser('MediaToolSurface', validateMediaToolSurface)
export const parseMediaEvidenceAck = parser('MediaEvidenceAck', validateMediaEvidenceAck)
export const parseMediaQualificationReservation = parser(
  'MediaQualificationReservation',
  validateMediaQualificationReservation,
)
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
export const parseSearchPage = parser('SearchPage', validateSearchPage)
export const parseProjectTask = parser('ProjectTask', validateProjectTask)
export const parseProjectTaskList = parser('ProjectTaskList', validateProjectTaskList)
export const parseWorkBoardView = parser('WorkBoardView', validateWorkBoardView)
export const parseWorkReceipt = parser('WorkReceipt', validateWorkReceipt)
export const parseWorkResult = parser('WorkResult', validateWorkResult)
export const parseSourceReviewProposal = parser('SourceReviewProposal', validateSourceReviewProposal)
export const parseSourceReviewAvailability = parser('SourceReviewAvailability', validateSourceReviewAvailability)
export const parseConversationList = parser('ConversationList', validateConversationList)
export const parseConversationMessagePage = parser('ConversationMessagePage', validateConversationMessagePage)
export const parseConversationStarted = parser('ConversationStarted', validateConversationStarted)
export const parseConversationMessageSent = parser('ConversationMessageSent', validateConversationMessageSent)
export const parseConversationWithdrawal = parser('ConversationWithdrawal', validateConversationWithdrawal)
export const parseConversationErasure = parser('ConversationErasure', validateConversationErasure)
export const parseDesignEditReceipt = parser('DesignEditReceipt', validateDesignEditReceipt)
export const parseDesignRetryReceipt = parser('DesignRetryReceipt', validateDesignRetryReceipt)
/**
 * One page of a project's native resource catalog (A51). A tolerant reader like the rest: a property the contract does
 * not list is dropped, not refused. The schema's relational meaning (owner and viewer agreement, the operations' set
 * and order, nextCursor against complete) is left to the consumer that reads it.
 */
export const parseProjectNativeResourcePage = parser('ProjectNativeResourcePage', validateProjectNativeResourcePage)
/**
 * A Personal Answer receipt (A53): the decision its own send, retry or cancel made. Tolerant like the rest; the pairing
 * of the operation with its decision's operation is left to the consumer.
 */
export const parsePersonalAnswerReceipt = parser('PersonalAnswerReceipt', validatePersonalAnswerReceipt)
/** One input's decisions (A53), in seq order and without the answer profile; tolerant like the rest. */
export const parsePersonalAnswerDecisionList = parser('PersonalAnswerDecisionList', validatePersonalAnswerDecisionList)
/**
 * A Personal answer control's receipt (A54): its own outcome and snapshot when it was made, a refused admission
 * included. Tolerant like the rest; the pairing of the operation with its action is left to the consumer.
 */
export const parsePersonalAnswerControlReceipt = parser(
  'PersonalAnswerControlReceipt',
  validatePersonalAnswerControlReceipt,
)
/** One automatic input as it stands now (A54): history, control, calls, withheld answers; tolerant like the rest. */
export const parsePersonalAnswerControlView = parser('PersonalAnswerControlView', validatePersonalAnswerControlView)
/** A page of the owner's control operations (A54), oldest first; tolerant like the rest. */
export const parsePersonalAnswerControlLog = parser('PersonalAnswerControlLog', validatePersonalAnswerControlLog)
/** A page of a conversation with controlled inputs (A54); tolerant like the rest. */
export const parsePersonalControlledTurnPage = parser('PersonalControlledTurnPage', validatePersonalControlledTurnPage)
/** One page of the versioned export (A54); tolerant like the rest. */
export const parsePersonalControlledExport = parser('PersonalControlledExport', validatePersonalControlledExport)

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
