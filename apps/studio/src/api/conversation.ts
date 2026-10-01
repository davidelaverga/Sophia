// Discussion and native tasks (contract amendments A05, A08). A contribution is discussion only, idempotent per person
// and key: after no reply, retry with the SAME key. New briefs are retired (SMC-M01); existing ones stay readable.
import type { Contribution, ContributionReceipt, NativeTaskDetail, ResearchRendition } from '@sophia/contracts'
import { parseContributionReceipt, parseNativeTaskDetail, parseResearchRendition } from '@sophia/contracts/validate'
import { callApi } from './client.ts'

/** Post attributed discussion: the text becomes the author's project source. */
export const submitContribution = (
  token: string,
  projectId: string,
  key: string,
  body: Contribution,
): Promise<ContributionReceipt> =>
  callApi(`/api/v1/projects/${projectId}/contributions`, { token, body, key }, parseContributionReceipt)

/** One task with its instruction and, once captured, its source-backed result. */
export const getNativeTask = (token: string, projectId: string, taskId: string): Promise<NativeTaskDetail> =>
  callApi(`/api/v1/projects/${projectId}/native-tasks/${taskId}`, { token, method: 'GET' }, parseNativeTaskDetail)

/**
 * "Try PDF again" (A11, 0032): print a report published without its PDF again, as a binding-less rendition. An
 * editor's admission: after no reply, retry with the SAME key, which returns the same rendition.
 */
export const requestRendition = (
  token: string,
  projectId: string,
  taskId: string,
  key: string,
): Promise<ResearchRendition> =>
  callApi(`/api/v1/projects/${projectId}/native-tasks/${taskId}/rendition`, { token, key }, parseResearchRendition)
