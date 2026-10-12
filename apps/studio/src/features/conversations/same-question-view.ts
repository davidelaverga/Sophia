// The same question's line (docs/plans/same-question.md): its words, owned here as CONTRIBUTING's copy rule asks, so
// the form only renders them.

/** What the form says when the question is already asked here: a lead, and the press that names the conversation. */
export interface SameQuestionLine {
  lead: string
  press: string
}

/** The line for a conversation that already asks it, by its title (whole: the press wraps a long one). */
export function sameQuestionLine(title: string): SameQuestionLine {
  return { lead: 'Already asked here:', press: `“${title.trim()}”` }
}
