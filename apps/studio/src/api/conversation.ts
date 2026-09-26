// Discussion and native tasks (contract amendment A05). A contribution is discussion only; a brief is admitted
// by its own explicit request. Both are idempotent per person and key: after no reply, retry with the SAME key.
import type {
  Contribution,
  ContributionReceipt,
  NativeTaskDetail,
  NativeTaskReceipt,
  NativeTaskRequest,
} from '@sophia/contracts'
import { parseContributionReceipt, parseNativeTaskDetail, parseNativeTaskReceipt } from '@sophia/contracts/validate'
import { callApi } from './client.ts'

/** Post attributed discussion: the text becomes the author's project source. */
export const submitContribution = (
  token: string,
  projectId: string,
  key: string,
  body: Contribution,
): Promise<ContributionReceipt> =>
  callApi(`/api/v1/projects/${projectId}/contributions`, { token, body, key }, parseContributionReceipt)

/** Admit one draft_brief. The receipt means admitted, never done: the task's phase follows the runtime. */
export const admitNativeTask = (
  token: string,
  projectId: string,
  key: string,
  body: NativeTaskRequest,
): Promise<NativeTaskReceipt> =>
  callApi(`/api/v1/projects/${projectId}/native-tasks`, { token, body, key }, parseNativeTaskReceipt)

/** One task with its instruction and, once captured, its source-backed result. */
export const getNativeTask = (token: string, projectId: string, taskId: string): Promise<NativeTaskDetail> =>
  callApi(`/api/v1/projects/${projectId}/native-tasks/${taskId}`, { token, method: 'GET' }, parseNativeTaskDetail)
