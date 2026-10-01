// A keyless rehearsal of the personal companion, for development and tests only: scripted replies chosen by a few
// words in the person's last message, the ones Luis's prototype (direction C) uses. It calls no model and keeps
// nothing; it is never live evidence, and the Studio says so while it answers (PersonalSpace.companion).
import type { Companion, CompanionReply } from './companion.ts'

interface Line {
  when: RegExp
  say: string
  /** The note Sophia suggests keeping after this reply, if any. */
  keep: string | null
}

const LINES: readonly Line[] = [
  {
    when: /pitch|present|deck|investor|demo/,
    say: 'A pitch on Friday is a lot to carry on top of everything else. Which part feels least ready right now, the story or the numbers?',
    keep: 'Preparing a pitch for Friday',
  },
  {
    when: /sleep|tired|exhaust|drained|insomnia/,
    say: 'It sounds like you’ve been running on reserve. What usually helps you land at night, even a little?',
    keep: 'Sleep has been short this week',
  },
  {
    when: /sister|brother|mom|mum|dad|friend|partner|family/,
    say: 'You mentioned someone close to you. Do you want to tell me how that’s been?',
    keep: 'Someone close has been on your mind',
  },
  {
    when: /anx|nervous|worr|scared|afraid|stress/,
    say: 'That tightness makes sense. Let’s make it smaller: what’s the one thing that would make tomorrow feel lighter?',
    keep: 'Feeling anxious before big moments',
  },
  {
    when: /story|narrative/,
    say: 'Then let’s find the story. If they remember only one sentence, what should it be?',
    keep: 'Working on the pitch story',
  },
  {
    when: /number|metric|revenue|math/,
    say: 'Numbers are easier to steady. Which one are you least sure you could defend if someone pushed?',
    keep: null,
  },
  { when: /on my mind/, say: 'I’m listening. Start wherever it’s easiest, even in the middle.', keep: null },
  { when: /get ready|prepare/, say: 'Let’s get you ready. What’s coming up, and when is it?', keep: null },
  { when: /just talk/, say: 'I’d like that. How has today been, honestly?', keep: null },
  { when: /thank|gracias/, say: 'I’m glad. I’m here whenever you want to pick this up again.', keep: null },
  {
    when: /sad|down|lonely|alone|cry/,
    say: 'I’m sorry it feels that way. I’m here. Do you want to tell me what happened, or just stay with it for a bit?',
    keep: null,
  },
  {
    when: /angry|frustrat|annoy|unfair/,
    say: 'That frustration makes sense. What would you want to happen instead?',
    keep: null,
  },
  {
    when: /work|job|boss|team|meeting|client/,
    say: 'Work can take up a lot of room. Is this something to keep here, or something you’ll want to carry to your team later?',
    keep: null,
  },
  { when: /happy|great|excited|proud|glad/, say: 'I love hearing that. What made it feel that way?', keep: null },
]

const FALLBACKS: readonly string[] = [
  'I hear you. Tell me a bit more: what part of that is weighing on you most?',
  'That sounds like a lot to hold. Would it help more to talk it through, or to make it smaller?',
  'I’m with you. When did this start to feel this way?',
  'Say more, if you like. I’m not in a hurry.',
  'What would someone who knows you well say about this?',
  'Let’s stay with it for a moment. What’s the hardest part?',
]

/** The rehearsal's reply to `text`. A message no line matches gets a fallback that depends only on its length. */
export function rehearsalReply(text: string): CompanionReply {
  const lower = text.toLowerCase()
  const line = LINES.find((l) => l.when.test(lower))
  if (line) return { text: line.say, suggestion: line.keep }
  return { text: FALLBACKS[text.length % FALLBACKS.length] ?? 'I hear you.', suggestion: null }
}

/** The rehearsal's welcome back: by name when it has one, and back to where the conversation stopped. */
export const rehearsalWelcome = (name: string | null) =>
  `Welcome back${name ? `, ${name}` : ''}. How has it been since we last talked? We can pick up where we left off.`

/**
 * The rehearsal companion; `pauseMs` keeps Sophia's "writing" visible for a moment, as a reply takes. Told to stop
 * (its time is up), it stops at once.
 */
export function rehearsalCompanion(pauseMs = 900): Companion {
  const pause = (signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, pauseMs)
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer)
          reject(new Error('Stopped: its time was up'))
        },
        { once: true },
      )
    })
  return {
    mode: 'rehearsal',
    answer: async (context, signal) => {
      await pause(signal)
      return rehearsalReply(context.asked.text)
    },
    greet: async (_context, name, signal) => {
      await pause(signal)
      return rehearsalWelcome(name)
    },
  }
}
