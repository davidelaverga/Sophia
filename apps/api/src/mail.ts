// Invitation email (S1-04A). Resend in production; in development a folder of files, so an invitation can
// be read without sending anything; nothing at all when neither is configured, and the invitation says so.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface MailAttachment {
  filename: string
  /** Base64. */
  content: string
  contentType: string
}

export interface MailMessage {
  to: string
  subject: string
  html: string
  text: string
  attachments: MailAttachment[]
  /** The provider sends one email per key, so a retried request never emails twice. */
  idempotencyKey: string
}

export interface Mailer {
  send: (message: MailMessage) => Promise<void>
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>

/** Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export function resendMailer(apiKey: string, from: string, fetchImpl: Fetch = fetch): Mailer {
  return {
    send: async (m) => {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': m.idempotencyKey,
        },
        body: JSON.stringify({
          from,
          to: [m.to],
          subject: m.subject,
          html: m.html,
          text: m.text,
          attachments: m.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
            content_type: a.contentType,
          })),
        }),
      })
      // The provider's body can echo addresses; the status is enough to diagnose.
      if (!res.ok) throw new Error(`Resend answered ${res.status}`)
    },
  }
}

/** Development: each email becomes files in `dir` (html, a text version with its headers, attachments). */
export function folderMailer(dir: string): Mailer {
  return {
    send: (m) => {
      mkdirSync(dir, { recursive: true })
      const base = join(
        dir,
        `${new Date().toISOString().replace(/[:.]/g, '-')}-${m.idempotencyKey.replace(/[^\w-]/g, '_')}`,
      )
      writeFileSync(`${base}.html`, m.html)
      writeFileSync(`${base}.txt`, `To: ${m.to}\nSubject: ${m.subject}\n\n${m.text}`)
      for (const a of m.attachments) writeFileSync(`${base}-${a.filename}`, Buffer.from(a.content, 'base64'))
      return Promise.resolve()
    },
  }
}
