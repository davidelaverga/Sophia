// Where a search hit is from (docs/plans/room-search.md): its kind and when, a meeting's with its time. Pure, so the
// words are unit-tested; the dates' formats come from the page (Intl).
import type { SearchHit } from '../../api/vision.ts'
import type { DateWords } from '../updates/updates-view.ts'

const KIND: Record<SearchHit['kind'], string> = {
  decision: 'Decision',
  note: 'Kept note',
  report: 'Report',
  report_section: 'Report section',
  recap: 'Meeting recap',
}

/** «Decision · Oct 4»; «Meeting recap · Oct 4, 15:00». */
export function hitSource(hit: Pick<SearchHit, 'kind' | 'at'>, words: DateWords): string {
  const at = new Date(hit.at)
  const when = hit.kind === 'recap' ? `${words.day(at)}, ${words.time(at)}` : words.day(at)
  return `${KIND[hit.kind]} · ${when}`
}
