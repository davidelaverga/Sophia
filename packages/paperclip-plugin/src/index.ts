// sophia.coordination, the first-party Paperclip plugin of WBC-02. The handlers, binding and manifest are plain modules
// tested in this repository; scripts/paperclip-build.mjs wraps `pluginHandlers` in the pinned SDK's worker entry.
export { pluginHandlers, hostOf, type SdkApiRequest, type SdkContext } from './bind.ts'
export {
  handleApiRequest,
  handleCommission,
  handleControl,
  handleLookup,
  readConfig,
  settleOpenWrites,
  type CoordinationConfig,
  type ProjectMapping,
} from './coordination.ts'
export { UnansweredHostCall } from './host.ts'
export type { ApiRequest, ApiResponse, CoordinationHost, HostIssue, HostIssueCreate } from './host.ts'
export { manifest, REVIEWER_AGENT_KEY, SETTLE_JOB_KEY } from './manifest.ts'
