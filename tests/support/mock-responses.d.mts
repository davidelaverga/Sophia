// Types for the OpenAI Responses test double (mock-responses.mjs), for TypeScript tests that use it.
export interface MockResponsesStep {
  text?: string
  status?: number
  delayMs?: number
  usage?: Record<string, unknown>
  toolCall?: { name: string; arguments?: unknown }
  /** INC04-S03A-R07-C1P: the terminal response carries no `usage` field. */
  omitUsage?: boolean
  /** INC04-S03A-R07-C1P: end with response.incomplete or response.failed instead of response.completed. */
  terminal?: 'completed' | 'incomplete' | 'failed'
  incompleteReason?: string
  /** INC04-S03A-R07-C1P: cut the connection after response.created, before any terminal event. */
  cutAfterCreated?: boolean
  /** INC04-S03A-R07-C1P: keep the stream open this long after its terminal event. */
  holdOpenMs?: number
}
export interface MockResponsesRequest {
  method: string
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}
export interface MockResponses {
  readonly baseURL: string
  readonly requests: MockResponsesRequest[]
  script(...steps: MockResponsesStep[]): void
  readonly active: number
  readonly abandoned: number
  readonly terminalSent: number
  close(): Promise<void>
}
export function startMockResponses(): Promise<MockResponses>
export function recordedRouteOverlay(bundlePatchText: string, baseURL: string): string
export function researchRouteOverlay(bundlePatchText: string, baseURL: string): string
export function conversationRouteOverlay(bundlePatchText: string, baseURL: string): string
export function reviewRouteOverlay(bundlePatchText: string, baseURL: string): string
