/** Sophia v0.3 design interfaces. No implementations or native method overloads are implied. */
export type ReceiptStage = 'admitted' | 'delivered' | 'incorporation_observed' | 'checked'
  | 'rejected' | 'failed' | 'outcome_unknown';
export interface WorkBinding {
  projectId: string; goalId: string; goalRevision: number; attemptId: string;
  resourceId: string; authorityEpoch: number; runtimeUnitId: string;
}
export interface RuntimeCommand {
  schema: 'sophia.runtime-command.v1'; commandId: string; binding: WorkBinding;
  kind: 'create' | 'resume' | 'input' | 'steer' | 'hold' | 'stop' | 'inspect';
  expectedNativeSessionId: string | null; contextPacketId: string | null;
  payload: Record<string, unknown>;
}
export interface RuntimeReceipt {
  commandId: string; attemptId: string; stage: ReceiptStage;
  nativeSessionId: string | null; nativeSequence: number | null;
  evidenceRefs: string[]; observedAt: string; reason: string | null;
}
export interface PeerEnvelope {
  schema: 'sophia.peer-message.v1'; messageId: string; projectId: string;
  goalId: string; goalRevision: number; senderAssignmentId: string;
  targetAssignmentId: string; replyTo: string | null;
  kind: 'question' | 'finding' | 'handback' | 'escalation';
  contentRef: string; authorityEpoch: number;
}
export interface HumanAction {
  id: string; binding: WorkBinding; nativeRequestId: string; fingerprint: string;
  ownerMemberId: string; effectSummary: string; dependencyIds: string[];
  state: 'required' | 'opened' | 'resolution_reported' | 'verified' | 'denied' | 'expired';
  expiresAt: string | null; resolutionEvidenceRefs: string[];
}
export interface ReviewIntent {
  id: string; projectId: string; authoredBy: string; sourceVersion: string;
  previewId: string; frameRef: string | null; targetRefs: string[];
  change: string; preserve: string[]; sourceContributionId: string;
}
export interface ContextPacket {
  id: string; projectId: string; goalId: string | null; goalRevision: number | null;
  authorityEpoch: number; acceptedDecisionRefs: string[]; selectedSourceRefs: string[];
  historicalEvidenceRefs: string[]; omittedRefs: {id: string; reason: string}[];
  audienceRevision: number; eligibilityRevision: number; createdAt: string;
}
