// Hearing a knock at the door (docs/plans/knock-alert.md): who started waiting since the last look, and what the
// browser's notification says of them. Pure, so the rule and its words are unit-tested; useKnockAlert sounds them.

interface Knock {
  id: string
  displayName: string
}

/** Those waiting now who were not at the last look: someone who left and knocks again is news again. */
export const arrivals = <T extends Knock>(seen: ReadonlySet<string>, waiting: readonly T[]): T[] =>
  waiting.filter((e) => !seen.has(e.id))

/** The notification's title: «Ana Ruiz is asking to join», or «2 people are asking to join». */
export const knockWords = (arrived: readonly Knock[]): string =>
  arrived.length === 1 && arrived[0]
    ? `${arrived[0].displayName} is asking to join`
    : `${String(arrived.length)} people are asking to join`
