/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_IDENTITIES?: string
  readonly VITE_DEV_PROJECT_ID?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Account providers enabled in Supabase Auth, comma-separated: "google,github". Empty offers email only. */
  readonly VITE_AUTH_PROVIDERS?: string
  /** API origin for a deployed Studio (e.g. https://sophia-next-api.onrender.com); empty in development. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
