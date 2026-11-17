# Cloudflare staging authentication

Staging site and API: https://maker-quest-auth-staging.racerblur.workers.dev
Account screen: `/account.html` (`/auth-test` is retained as an alias).

This Worker now serves a staging copy of the site and same-origin Better Auth APIs. The root HTML files, Supabase implementation, `main`, Firebase branch, Pages settings and existing records are preserved. The generated staging HTML adds account controls, account-backed passport badges and hourly game leaderboards. Public image/audio assets come from the existing Cloudflare Pages site.

## Passkey accounts

New users can create a staging account with a display name and a discoverable
passkey. This flow uses no inbox and works alongside the existing Google and
email/password options. Passkeys are scoped to the staging Worker hostname.

Signup shows eight one-time recovery codes. Save them before signing in. A
signed-in user can also add a backup passkey. Using a recovery code registers a
replacement passkey, consumes that code and revokes the old passkeys and
sessions. Remaining codes are still usable. Users who lose access to all their
passkeys and codes cannot recover a passkey-only account.

Apply `migrations/0003_passkeys.sql` to the dedicated staging D1 before deploying
the Worker. Passkey-only users have a reserved internal address and do not
claim a verified email address.

## Configuration

- D1 `DB`: `maker-quest-staging-db`, UUID `0a1cea72-f767-480f-8748-0bccbb01aaf9`.
- Worker secrets: `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, and optional `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- Google redirect URI: `https://maker-quest-auth-staging.racerblur.workers.dev/api/auth/callback/google`.
- `EMAIL_FROM` must use a Resend-verified domain for general delivery. Current `onboarding@resend.dev` sender is restricted to the Resend account owner's email. Do not disable verification to work around delivery errors.
- Google remains a sign-in option when configured; it uses Google's verified identity without a separate Maker Quest verification email. Recovery for Google-only users happens through Google.
- Password resets revoke existing sessions. Verification links and reset URLs are never logged by our sender. Query strings are redacted in Worker observability.
- Secrets stay in Cloudflare; deployments through its API retain existing secret bindings. Do not replace the secret or migrate existing password records.

The Google button remains disabled until both OAuth values exist. Email authentication is disabled if either the sender or Resend key is absent. The staging UI explicitly warns about restricted test-sender delivery.

## Build and test

From `cloudflare-auth`:

```sh
npm ci
npm run build
npm run check
npm test
```

`npm test` packages the Worker and runs Miniflare/D1 integration tests plus Chromium browser checks. Set `CHROMIUM_PATH` if Chromium is elsewhere. Resend is intercepted locally; the Google provider is mocked. Chromium uses virtual authenticators to exercise passkey signup, sign-in, backup enrollment, recovery, and saved progress.

`tests/remote-smoke.mjs /path/to/synthetic-account.json` exercises a deployed, previously verified synthetic account (`name`, `email`, `password`; email must end in `@example.invalid`). It leaves test badges and scores intact. The environment's intercepting proxy requires `TEST_IGNORE_HTTPS_ERRORS=1` for Chromium here; this is optional in the test runner and never changes site security.

`npm run deploy` builds the static payload before Wrangler deployment. Review the target account and staging bindings first. There are no live-site routes in this configuration. Apply additive migrations only to the staging D1. Never merge this work into `main` as a production switch.

## Limitations

Badges and scores are demo data: browser clients can claim sample badges and submit bounded scores. Authentication and account ownership are enforced, but the leaderboard does not validate gameplay server-side and must not award prizes. Each account keeps its best score per game per UTC hour. Head-to-head and spectator Bot Battle modes do not submit scores. Power Racers records completed player wins. Guest badges are not automatically copied into an account, which avoids leaking progress between accounts on shared devices.

See `docs/cloudflare-staging-results.md` for actual validation and outstanding account access.
