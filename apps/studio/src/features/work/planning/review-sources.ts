// What a source review's selection holds (WBC-02 G5): the text of the chosen sources together, against the most a
// review reads. Sophia refuses a proposal over it, so the form says so before anything is proposed (Codex on #107).

interface Sized {
  readonly sourceId: string
  readonly byteLength: number
}

/** The chosen sources' text in all, and whether it is more than a review may read. */
export function selectionOf(sources: readonly Sized[], chosen: readonly string[], maxInputBytes: number) {
  const bytes = sources.filter((s) => chosen.includes(s.sourceId)).reduce((sum, s) => sum + s.byteLength, 0)
  return { bytes, over: bytes > maxInputBytes }
}

interface Offered extends Sized {
  /** The sources this report version cites that may be reviewed beside it (A43). */
  readonly supporting: readonly Sized[]
}

/** Every source offered, once: the report versions, and the sources they cite. */
export function offeredSources(reports: readonly Offered[]): Sized[] {
  const all = new Map<string, Sized>()
  for (const r of reports) for (const s of [r, ...r.supporting]) if (!all.has(s.sourceId)) all.set(s.sourceId, s)
  return [...all.values()]
}

/**
 * What stays chosen of `chosen`, in its order: a report version still offered, and a cited source of a chosen report
 * still offered. A cited source whose report was let go, or anything no longer offered, is dropped, so nothing chosen
 * is hidden, kept stale or sent.
 */
export function stillChosen(reports: readonly Offered[], chosen: readonly string[]): string[] {
  const parents = reports.filter((r) => chosen.includes(r.sourceId))
  return chosen.filter((id) => parents.some((r) => r.sourceId === id || r.supporting.some((s) => s.sourceId === id)))
}

/** "32 KiB", "33.1 KiB": the size as the limit is stated, rounded up, so a total one byte over never reads as the limit. */
export const kib = (bytes: number): string => `${String(Math.ceil(bytes / 102.4) / 10)} KiB`

/** Sophia keeps an allowance in millionths of a dollar: the field's step and least amount (Codex on #107). */
export const ALLOWANCE_STEP = 0.000001

/**
 * Whether an allowance may be proposed: positive, within the project's cap, and in millionths of a dollar, so the
 * field's own validation and this agree for any cap, a sub-cent one included.
 */
export function allowanceOk(usd: number, max: number): boolean {
  const micros = usd * 1_000_000
  return usd > 0 && usd <= max && Math.abs(micros - Math.round(micros)) < 0.001
}

/**
 * Whether a goal offers Review sources: where Sophia enables the pilot and offers something to review (E2E-Q3), or
 * while a proposal is unanswered, since the form is where it is asked about again.
 */
export function offered(pilot: { enabled: boolean; sources: readonly unknown[] }, unanswered: boolean): boolean {
  return pilot.enabled && (pilot.sources.length > 0 || unanswered)
}
