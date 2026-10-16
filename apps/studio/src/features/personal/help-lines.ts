// Personal says Sophia is an AI, and where help is (docs/plans/personal-ai-disclosure.md): the line that stays under
// the field, and the crisis lines «Help now» lists. Each number was checked on 2026-10-16 against the service's own or
// its government's pages (the plan's handoff names them). A draft for Luis and legal review.

export interface HelpWay {
  label: string
  /** A call (`tel:`), a text (`sms:`) or a site (`https:`, in a new tab). */
  href: string
}

export interface HelpLine {
  where: string
  name: string
  note: string
  ways: readonly HelpWay[]
}

/** Said under the field and in a talk, for as long as either is open (NY GBL art. 47, CA SB 243, EU AI Act art. 50). */
export const AI_LINE = 'Sophia is an AI, not a person.'

export const HELP_LEAD =
  'If you’re thinking about suicide or self-harm, or you’re in crisis, you can talk to a person now. These lines are free.'

export const EMERGENCY = 'In danger now? Call your local emergency number: 911 in the US and Canada, 112 in Europe.'

/** Sophia's part, said plainly: she calls no one. */
export const HELP_SOPHIA = 'Sophia is an AI: she can’t call anyone for you.'

const call = (number: string, dialled = number.replaceAll(' ', '')): HelpWay => ({
  label: `Call ${number}`,
  href: `tel:${dialled}`,
})
const text = (number: string): HelpWay => ({ label: `Text ${number}`, href: `sms:${number}` })

export const HELP_LINES: readonly HelpLine[] = [
  {
    where: 'United States',
    name: '988 Suicide & Crisis Lifeline',
    note: 'Any time, by call, text or chat.',
    ways: [call('988'), text('988'), { label: '988lifeline.org', href: 'https://988lifeline.org' }],
  },
  {
    where: 'Canada',
    name: '9-8-8 Suicide Crisis Helpline',
    note: 'Any time, in English or French.',
    ways: [call('988'), text('988')],
  },
  { where: 'UK and Ireland', name: 'Samaritans', note: 'Any time, free from any phone.', ways: [call('116 123')] },
  { where: 'Spain', name: 'Línea 024', note: 'Any time, in Spanish.', ways: [call('024')] },
  {
    where: 'Anywhere else',
    name: 'Find a Helpline',
    note: 'Free helplines in your country.',
    ways: [{ label: 'findahelpline.com', href: 'https://findahelpline.com' }],
  },
]
