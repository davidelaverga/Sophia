# Crash reports and feedback (Sentry)

> 2026-10-15 · The deep gaps report (`evaluacion-2026-10-15/informe-brechas-a-fondo.md` §2.8): with open sign-up, an
> error a person meets reaches no one, and a person has nowhere to say what is wrong. Luis (2026-10-15): «Vamos con
> Sentry». The same service answers both: its crash reports, and its user feedback. Queue item 4.

## What changes

- **`@sentry/react` 10.75.3**, a mature line released 23 Sep 2026, more than two weeks ago.
  - The lock changes, so `workspace_lock_sha256` in `config/runtime-unit.json` changes with it.
  - It is loaded on its own chunk, and only where a DSN is set, so the Studio's start doesn't carry it.
- **`crash-report.ts`:**
  - `startCrashReports()` from `main.tsx`;
  - `reportCrash(error)` from `LoadFailed`;
  - `sendFeedback(words)`.
  - With `VITE_SENTRY_DSN` unset (development, the fixtures by default, any deploy that hasn't set it), nothing loads
    and nothing is offered.
- **Privacy by construction** (`crash-scrub.ts`, pure):
  - No default personal data, no performance tracing, no session replay.
  - Every address that is sent keeps its origin and path only. The query and the fragment go, and invitation tokens
    live in the fragment.
  - Console breadcrumbs are dropped.
  - A click breadcrumb's attribute values are blanked, since `aria-label`s can hold names.
  - Request headers and cookies are dropped, and so is the user.
- **«Send feedback»** in the account menu, shown only when reports are on. It opens a sheet: «What would you like us to
  know?», then Send. It says «Sent. Thank you.» once Sentry has taken it, and «Couldn’t send it. Try again.» if not.
- **CSP:** `connect-src` gains Sentry's ingest hosts.
- **The privacy notice** names Sentry and what it receives.
- **Fixtures:** `?sentry=1` turns reports on, with a DSN whose host the tests answer (`fixtures/crash-dsn.ts`, in place
  of `src/app/crash-dsn.ts`, as `fake-livekit.ts` is).

## For Luis

- Create a Sentry project (React), then set `VITE_SENTRY_DSN` in Vercel for production.
- Optionally set `VITE_SENTRY_ENVIRONMENT` (default `production`).

## Not here

- The API's own errors (Fastify on Render): a separate PR in the API's lane.

## Checks

- `crash-scrub.test.ts`:
  - an address loses its query and fragment;
  - console breadcrumbs go;
  - click attribute values are blanked;
  - headers, cookies and the user go.
- `crash-feedback.spec.ts`:
  - feedback reaches the service with its words, and is said sent;
  - a thrown error is reported without the address's query or fragment;
  - without a DSN, no Send feedback.
