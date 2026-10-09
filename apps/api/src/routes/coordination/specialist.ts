// The source reviewer as the registry records it (config/specialists.json, generated into @sophia/contracts): the
// role, and the priced route it runs on as the runtime unit records it. Admission takes both from here, never from
// a request; the proposal shows them before anyone accepts.
import { SPECIALISTS, type SourceReviewRoute } from '@sophia/contracts'

const reviewer = SPECIALISTS.find((s) => s.taskKind === 'source_review')
if (!reviewer) throw new Error('config/specialists.json registers no source reviewer')

export const REVIEW_ROUTE: SourceReviewRoute = {
  role: reviewer.id,
  id: reviewer.route,
  provider: reviewer.routeSpec.provider,
  model: reviewer.routeSpec.model,
  reasoningEffort: reviewer.routeSpec.reasoningEffort,
  maxTokens: reviewer.routeSpec.maxTokens,
  prices: { ...reviewer.routeSpec.prices },
  priceUnit: 'usd_per_million_tokens',
}
