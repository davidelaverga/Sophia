// Types for the OpenAI Responses test double (mock-responses.mjs), for TypeScript tests that use it.
export interface MockResponsesStep {
  text?: string
  status?: number
  delayMs?: number
  usage?: Record<string, unknown>
  toolCall?: { name: string; arguments?: unknown }
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
  close(): Promise<void>
}
export function startMockResponses(): Promise<MockResponses>
export function recordedRouteOverlay(bundlePatchText: string, baseURL: string): string
export function researchRouteOverlay(bundlePatchText: string, baseURL: string): string
export function conversationRouteOverlay(bundlePatchText: string, baseURL: string): string
export function reviewRouteOverlay(bundlePatchText: string, baseURL: string): string
