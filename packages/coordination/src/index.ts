// @sophia/coordination (WBC-02): the work-level binding between Sophia and Paperclip. The board's read projection,
// the signed envelope on every delivery to the plugin, and the plugin wire both sides read. No scheduler lives here:
// Paperclip owns the operational lifecycle, Sophia's database owns decisions, permits and the safety fence.
export { canonicalJson } from './canonical.ts'
export {
  bodyDigest,
  ENVELOPE_AUDIENCE,
  ENVELOPE_ISSUER,
  ENVELOPE_MAX_SECONDS,
  EnvelopeError,
  signEnvelope,
  verifyEnvelope,
  type EnvelopeClaims,
  type EnvelopeInitiator,
  type EnvelopeOp,
  type EnvelopeRefusal,
  type SignedEnvelope,
  type VerifyOptions,
} from './envelope.ts'
export {
  currentResult,
  itemView,
  lifecycleOf,
  projectBoard,
  REVIEW_POLICY,
  type AttemptFact,
  type BoardFacts,
  type CommissionState,
  type DecisionFact,
  type GoalStatus,
  type Lifecycle,
  type PlanFact,
  type PlanState,
  type ResultFact,
  type WorkFact,
} from './projection.ts'
export * from './plugin-wire.ts'
