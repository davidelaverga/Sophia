# Hosted Supabase — sophia-next

| | |
|---|---|
| Project | `sophia-next`, ref `ikigawvpaxnvdjzzzhws`, org **Sophia**, region us-west-1, size micro |
| Postgres | 17.6 · schema `sophia` (private), ledger `sophia_meta.schema_migrations` |
| Auth | ES256 asymmetric signing keys; JWKS at `https://ikigawvpaxnvdjzzzhws.supabase.co/auth/v1/.well-known/jwks.json` |
| Database access | session pooler `aws-0-us-west-1.pooler.supabase.com:5432` (the direct host is IPv6-only). Session mode is required: the API uses `LISTEN` and the migration runner uses advisory locks |
| TLS | `sslmode=verify-full&sslrootcert=<path>/prod-ca-2021.crt`. Never `no-verify` |

## Files

- `prod-ca-2021.crt`: Supabase Root 2021 CA (public), from Supabase's documented download URL. SHA-256 `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`, matching the root the pooler presents; `openssl s_client -verify_hostname` → OK. Valid until 2031-04-26.

## Roles

| Login | Use | Notes |
|---|---|---|
| `postgres` | migrations only (`pnpm db:migrate`) | On Supabase it has **BYPASSRLS**: never an application login |
| `sophia_api_app` | API | member of `sophia_api`; no superuser, BYPASSRLS, CREATEDB or CREATEROLE; cannot write tables directly or read `sophia_secrets`. Pooler user: `sophia_api_app.<ref>` |

Passwords and API keys live outside Git (the operator's secret store; locally `~/.sophia/`). The service-role / secret key is not used by the API. The live test suite uses it only to create and delete synthetic `@sophia.test` users.

## Operations

```bash
# migrations (migration owner URL, verify-full TLS)
SOPHIA_MIGRATION_DATABASE_URL=... pnpm db:migrate -- --dry-run
SOPHIA_MIGRATION_DATABASE_URL=... pnpm db:migrate

# live auth crossing against the hosted project (cleans up its users and projects)
node --env-file=<hosted env> --test "apps/*/src/**/*.live.test.ts"
```

## Auth URL configuration (applied 2026-09-24)

Pushed with a minimal `config.toml` that declares only these two properties (after reviewing `supabase config diff`: 2 declared updates; 11 remote-only properties left untouched and re-verified):

- `site_url = "http://localhost:5173"` (was the default `http://localhost:3000`)
- `additional_redirect_urls = ["http://localhost:5173/**", "http://127.0.0.1:5173/**"]`

Updated 2026-09-24 when the Studio was deployed (same method, 2 declared updates, the rest untouched):

- `site_url = "https://sophia-studio.vercel.app"`
- `additional_redirect_urls = ["https://sophia-studio.vercel.app/**", "http://localhost:5173/**", "http://127.0.0.1:5173/**"]`

The magic-link email carries the link and the one-time code ([templates/magic-link.html](templates/magic-link.html), subject "Sign in to Sophia"), pushed the same way with `[auth.email.template.magic_link]` and `content_path`. The link only signs in the browser that asked for it (PKCE); the code works from any device. Invitations sent from the dashboard return tokens in the URL fragment, which the Studio accepts.

Never push the repository's `supabase/config.toml` to this project: it describes the local stack.

## Local Studio against this project

```bash
node scripts/dev-stack.ts --hosted ~/.sophia/sophia-next-hosted.env
```

Open http://localhost:5173 **in the same browser where you will click the email link** (PKCE keeps its verifier in that browser's storage).

## Pending (owner decisions in the dashboard)

- **Enable SSL enforcement** (Database → Settings). The project currently accepts non-TLS connections; our clients always use `verify-full`.
- **Disable public sign-ups** (Authentication → Sign In / Providers) and invite the founders. Until then anyone holding the publishable key can register and create projects.
- Set the **Site URL** and redirect URLs once the Studio has its Vercel URL (magic links redirect there).
- Default Supabase email only delivers to organization members and is rate-limited. Configure custom SMTP before inviting anyone outside the org.
