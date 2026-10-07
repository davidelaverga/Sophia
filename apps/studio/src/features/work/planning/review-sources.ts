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
