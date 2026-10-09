// The source-review pilot enabled (WBC-02, work.html `served=1`): four report versions a review may read, sized so that
// two or three of them, each within the limit, can hold more text together than a review reads (Codex on #107).
import type { SourceReviewAvailability } from '@sophia/contracts'

const at = '2026-10-01T09:00:00.000Z'
const source = (n: number, label: string, byteLength: number) => ({
  sourceId: `00000000-0000-4000-8000-0000000071${String(n).padStart(2, '0')}`,
  label,
  mime: 'text/markdown',
  byteLength,
  createdAt: at,
})

export const SOURCE_REVIEW: SourceReviewAvailability = {
  enabled: true,
  reason: null,
  runtimeReady: true,
  maxAllowanceUsd: 0.5,
  limits: {
    maxSources: 3,
    maxInputBytes: 32768,
    maxModelRequests: 8,
    maxReportBytes: 16384,
    web: false,
    shell: false,
    connectors: false,
  },
  route: {
    role: 'sophia-source-review-v1',
    id: 'source-review-luna-high-v1',
    provider: 'openai-review',
    model: 'gpt-6-luna',
    reasoningEffort: 'high',
    maxTokens: 16000,
    prices: { input: 0.1, cacheRead: 0.01, cacheWrite: 0.125, output: 0.5 },
    priceUnit: 'usd_per_million_tokens',
  },
  sources: [
    source(1, 'Launch brief v3', 20000),
    source(2, 'Press plan v2', 12768),
    source(3, 'Budget note v1', 1),
    source(4, 'Risk register v5', 16000),
  ],
}
