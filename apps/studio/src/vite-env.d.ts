/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_IDENTITIES?: string
  readonly VITE_DEV_PROJECT_ID?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Account providers enabled in Supabase Auth, comma-separated: "google,github". Empty offers email only. */
  readonly VITE_AUTH_PROVIDERS?: string
  /** Supabase Auth's passkey Relying Party ID ("sophia-ei.com"): passkeys are offered only on that domain. */
  readonly VITE_PASSKEY_RP_ID?: string
  /** API origin for a deployed Studio (e.g. https://sophia-next-api.onrender.com); empty in development. */
  readonly VITE_API_URL?: string
  /** "1" where the APIs proposed in issue #105 are answered (the fixture pages): their controls show (app/vision.ts). */
  readonly VITE_SOPHIA_VISION?: string
  readonly VITE_SOPHIA_CONVERSATIONS?: string
  /** "1" where A15's needs and A34's Updates are served: they show without the vision flag (app/attention.ts). */
  readonly VITE_SOPHIA_ATTENTION?: string
  /** The Sentry project crash reports and feedback go to; unset, there are none (docs/plans/crash-feedback.md). */
  readonly VITE_SENTRY_DSN?: string
  /** Sentry's environment for this deploy; «production» unless set. */
  readonly VITE_SENTRY_ENVIRONMENT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
