// The source-review pilot enabled (WBC-02, work.html `served=1`): four report versions a review may read, sized so that
// two or three of them, each within the limit, can hold more text together than a review reads (Codex on #107). The
// first cites two sources a review may read beside it (A43).
import type { SourceReviewAvailability } from '@sophia/contracts'

const at = '2026-10-01T09:00:00.000Z'
const source = (n: number, label: string, byteLength: number, supporting: Cited[] = []) => ({
  sourceId: `00000000-0000-4000-8000-0000000071${String(n).padStart(2, '0')}`,
  label,
  mime: 'text/markdown',
  byteLength,
  createdAt: at,
  supporting,
})

type Cited = SourceReviewAvailability['sources'][number]['supporting'][number]

/** A source a report version cites that may be reviewed beside it (A43). */
const cited = (n: number, label: string, byteLength: number): Cited => ({
  sourceId: `00000000-0000-4000-8000-0000000072${String(n).padStart(2, '0')}`,
  label,
  mime: 'text/plain; charset=utf-8',
  byteLength,
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
    // It cites a project note and a page the research read; together with it they fit a review, the page over it.
    source(1, 'Launch brief v3', 20000, [
      cited(1, 'Project note · observation', 600),
      cited(2, 'Web page · example.org', 12169),
    ]),
    source(2, 'Press plan v2', 12768),
    source(3, 'Budget note v1', 1),
    source(4, 'Risk register v5', 16000),
  ],
}

/**
 * `rendition=1` (FND-B-HTML-RENDITION-01, 0083): what Sophia offers for a report a design published as version 2. The
 * page is a source of its own (compiled HTML, its real size); the Markdown text versions 1 and 2 both keep is offered
 * once, named for both; each beside the source the version cites. Two more reports reach the three-source and 32 KiB
 * limits. Synthetic ids and sizes: the shape the corrected offer returns (design.db.test.ts), never production content.
 */
export const RENDITION_SOURCES: SourceReviewAvailability['sources'] = [
  {
    sourceId: '00000000-0000-4000-8000-000000007301',
    label: 'Launch report · version 2 · HTML page',
    mime: 'text/html; charset=utf-8',
    byteLength: 6725,
    createdAt: at,
    supporting: [cited(1, 'Project note · observation', 600)],
  },
  {
    sourceId: '00000000-0000-4000-8000-000000007302',
    label: 'Launch report · versions 1, 2',
    mime: 'text/markdown; charset=utf-8',
    byteLength: 2857,
    createdAt: at,
    supporting: [cited(1, 'Project note · observation', 600)],
  },
  source(2, 'Press plan v2', 12768),
  source(4, 'Risk register v5', 26000),
]
