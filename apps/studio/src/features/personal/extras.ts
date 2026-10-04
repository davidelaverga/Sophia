// What the personal space shows once the API gives it (docs/plans/personal-twenty.md): what she remembers of you, her
// look back at your week, and a live talk with her. All optional: Places passes none of them yet, so none of it shows
// in the app until its backend exists; the Personal fixture shows each. The shapes are the ones proposed to Davide.

/** Something she keeps about you, to know you; you can correct it or have her forget it. */
export interface PersonalMemory {
  id: string
  text: string
  /** When she learned it (ISO). */
  learnedAt: string
}

export interface Memory {
  items: readonly PersonalMemory[]
  forget: (id: string) => void
  correct: (id: string, text: string) => void
}

/** Her look back at your week: a few sentences and the themes she saw. */
export interface WeekLook {
  id: string
  /** The Monday the week began (ISO). */
  weekOf: string
  text: string
  themes: readonly string[]
}

export interface Week {
  look: WeekLook
  keep: (id: string) => void
  dismiss: (id: string) => void
}

/** A line said in a live talk, captioned. */
export interface TalkLine {
  who: 'you' | 'sophia'
  text: string
}

/** How a live talk stands: what has been said, and who speaks now. */
export interface TalkState {
  lines: readonly TalkLine[]
  speaking: 'you' | 'sophia' | null
}

export interface TalkControl {
  mute: (on: boolean) => void
  /** Ends the talk: what was said is written into the conversation as turns. */
  end: () => void
}

/**
 * A live talk with her, by voice: `heard` follows it as it goes. The Studio starts a talk once per opening and keeps the
 * voice it was given; under React's StrictMode (development) `start` runs twice and the first talk is ended at once, so
 * starting must be cheap to undo (no microphone prompt, no room joined yet) and a talk ended with nothing said writes
 * nothing. Transcript turns need `replyTo` set (or their own kind), so a reply in a talk never reads as her greeting.
 */
export interface Voice {
  start: (heard: (state: TalkState) => void) => TalkControl
}

export interface PersonalExtras {
  memory?: Memory
  week?: Week
  voice?: Voice
}
