// Where a sign-in email waits, for the common inboxes: "Check your email" offers to open it, one press away. Only the
// address's own domain decides; an unknown domain gets nothing, never a guess.

export interface MailHome {
  name: string
  url: string
}

const HOMES: readonly (MailHome & { domains: readonly string[] })[] = [
  { name: 'Gmail', url: 'https://mail.google.com/', domains: ['gmail.com', 'googlemail.com'] },
  {
    name: 'Outlook',
    url: 'https://outlook.live.com/mail/',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
  },
  { name: 'iCloud Mail', url: 'https://www.icloud.com/mail', domains: ['icloud.com', 'me.com', 'mac.com'] },
  { name: 'Yahoo Mail', url: 'https://mail.yahoo.com/', domains: ['yahoo.com', 'ymail.com'] },
  { name: 'Proton Mail', url: 'https://mail.proton.me/', domains: ['proton.me', 'protonmail.com', 'pm.me'] },
]

/** The inbox an address's mail opens in, by its domain; null when the domain isn't one of these. */
export function mailHome(email: string): MailHome | null {
  const domain = email.trim().toLowerCase().split('@').at(-1) ?? ''
  const home = HOMES.find((h) => h.domains.includes(domain))
  return home ? { name: home.name, url: home.url } : null
}

/** Whether an address can be one: a name, an @, and a domain with a dot. The Auth service decides the rest. */
export const plausibleEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
