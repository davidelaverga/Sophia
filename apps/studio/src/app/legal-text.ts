// The terms of use and the privacy notice (docs/plans/terms-privacy.md): plain words for what the product does today.
// A change here is a change of terms: move UPDATED with it.

export type LegalDoc = 'terms' | 'privacy'

export interface LegalSection {
  heading: string
  /** Paragraphs; a list's items are paragraphs that start with «· ». */
  body: readonly string[]
}

export const UPDATED = '25 October 2026'

export const TITLES: Record<LegalDoc, string> = { terms: 'Terms of use', privacy: 'Privacy notice' }

/** Where to write, whatever the app can do (legal-contact.md): a page shows it as a mailto link. */
export const CONTACT_EMAIL = 'info@sophia-ei.com'

const CONTACT = `Questions, requests about your data, deleting your account, or a problem to report: write to ${CONTACT_EMAIL}. You can also use Send feedback in Sophia’s account menu, where it’s offered.`

export const TERMS: readonly LegalSection[] = [
  {
    heading: 'What Sophia is',
    body: [
      'Sophia is a place to think with an AI companion. It has two spaces: a personal one, where you talk with Sophia and keep notes only you see, and a work one, the Studio, where a team shares projects, a room for calls, goals, reports and conversations with Sophia.',
      'Sophia is young and changes often. Features may change, pause or go away, and the service may sometimes be unavailable.',
    ],
  },
  {
    heading: 'Your account',
    body: [
      'Anyone can create an account with an email link or a sign-in provider, then add a passkey to sign in with. An account is for one person. Keep access to your email and devices safe: whoever holds them can act as you.',
      'You need to be at least 16 to use Sophia.',
    ],
  },
  {
    heading: 'Your content',
    body: [
      'What you write, say to Sophia, upload or create stays yours.',
      'You let us store, copy and process it only to run Sophia for you and the people you share it with. That includes sending it to the AI providers named in the Privacy notice so Sophia can answer, summarise and write reports.',
      'What you put in a project is seen by that project’s members, as the project’s roles allow. Your personal space is seen by you alone.',
    ],
  },
  {
    heading: 'Using Sophia well',
    body: [
      'Don’t use Sophia to:',
      '· break the law or anyone’s rights, including copyright and privacy;',
      '· harass, threaten or deceive people, in calls or in writing;',
      '· reach projects, calls or data that aren’t yours, or probe, overload or disrupt the service;',
      '· upload malware, or content meant to harm.',
      'Admins answer for who they invite and let into their projects.',
    ],
  },
  {
    heading: 'What Sophia says',
    body: [
      'Sophia’s answers, summaries and reports are made by AI models and can be wrong, incomplete or out of date. Check what matters before you rely on it. Nothing Sophia says is legal, medical, financial or other professional advice.',
    ],
  },
  {
    heading: 'Invitations and guests',
    body: [
      'An admin can invite people to a project or let a guest into its room from the door. A guest sees and hears what the room shows while they are in it, and leaves when the call ends or an admin takes them out.',
    ],
  },
  {
    heading: 'Ending',
    body: [
      'You can leave a project at any time; a project’s last admin hands the role over first. You can erase your personal space from Your data.',
      'We may suspend an account that breaks these terms or puts others at risk, and will say why when we can.',
    ],
  },
  {
    heading: 'No guarantees',
    body: [
      'Sophia is provided as it is. To the extent the law allows, we make no promise that it will be uninterrupted, error-free or fit for a particular purpose, and we are not liable for indirect or consequential losses. Nothing here limits rights the law gives you that can’t be limited.',
    ],
  },
  {
    heading: 'Changes',
    body: [
      'When these terms change, the date above changes. If a change matters, we will say so in Sophia before it applies. Using Sophia after that means you accept the new terms.',
    ],
  },
  { heading: 'Contact', body: [CONTACT] },
]

export const PRIVACY: readonly LegalSection[] = [
  {
    heading: 'What we keep',
    body: [
      '· Your account: your email, and the name and picture your sign-in provider gives, if any.',
      '· In projects: messages, brief notes, decisions, goals, tasks, reports and the sources behind them, invitations, and who did what, so admins can see a project’s activity.',
      '· In your personal space: your conversation with Sophia and your notes, seen by you alone.',
      '· In calls: who joined and when. Calls aren’t recorded. While Sophia is in a call, what is said is processed live to show captions and let her answer; what is said to her may be kept in the project’s conversation.',
    ],
  },
  {
    heading: 'Who processes it',
    body: [
      'We use a few services to run Sophia. Each handles your data only to do its part:',
      '· Supabase: sign-in, the database and stored files.',
      '· LiveKit: the calls’ sound and video.',
      '· Google (Gemini) and OpenAI: the AI models behind Sophia’s voice, answers and research.',
      '· Tavily and Jina: when Sophia researches, the words she searches for go to Tavily and the pages she reads to Jina.',
      '· Resend: the emails Sophia sends, such as sign-in links and invitations.',
      '· Vercel and Render: hosting the app and its server.',
      '· Sentry: reports of errors in the app, and the feedback you send. A report carries the page’s address without its query or link part, and is built to leave your content and account out.',
    ],
  },
  {
    heading: 'Who sees what',
    body: [
      'A project’s members see its content and each other’s names, as their roles allow. Its admins also see its activity. A guest sees what the room shows while they are in it. Nobody but you sees your personal space.',
    ],
  },
  {
    heading: 'On your device',
    body: [
      'Sophia keeps a few things in your browser: unsent drafts, your choices (such as the microphone, the theme or a view’s layout) and what speeds up the next visit. Signing out removes what is personal.',
    ],
  },
  {
    heading: 'Your choices',
    body: [
      'You can download a copy of your personal space or erase it from Your data, forget a note, and leave any project. To delete your account entirely, or to ask what we hold about you, write to us (see Contact).',
    ],
  },
  {
    heading: 'How long',
    body: [
      'We keep your data while your account and your projects exist. What you erase or forget is removed. Service logs are kept only as long as needed to run and secure Sophia.',
    ],
  },
  {
    heading: 'What we don’t do',
    body: ['We don’t sell your data, show ads, or use your content to advertise to you.'],
  },
  {
    heading: 'Age',
    body: ['Sophia isn’t meant for anyone under 16.'],
  },
  {
    heading: 'Changes',
    body: ['When this notice changes, the date above changes, and we will say so in Sophia when a change matters.'],
  },
  { heading: 'Contact', body: [CONTACT] },
]

export const SECTIONS: Record<LegalDoc, readonly LegalSection[]> = { terms: TERMS, privacy: PRIVACY }
