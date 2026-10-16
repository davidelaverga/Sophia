// Personal says Sophia is an AI, and where help is (docs/plans/personal-ai-disclosure.md). Stub: nothing yet.

export interface HelpWay {
  label: string
  href: string
}

export interface HelpLine {
  where: string
  name: string
  note: string
  ways: readonly HelpWay[]
}

export const AI_LINE = ''
export const EMERGENCY = ''
export const HELP_LINES: readonly HelpLine[] = []
