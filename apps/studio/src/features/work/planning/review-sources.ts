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

/** "32 KiB", "33.1 KiB": the size as the limit is stated. */
export const kib = (bytes: number): string => `${String(Number((bytes / 1024).toFixed(1)))} KiB`
