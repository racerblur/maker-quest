# Cloudflare staging results — 2026-11-17

## Deployment

URL: https://maker-quest-auth-staging.racerblur.workers.dev
Worker deployment ID: `799aaf47d042417684ffa82a561ea75e`.
D1 additive migration: `cloudflare-auth/migrations/0002_progress.sql`.
No data was deleted. Existing Firebase staging, Cloudflare Pages deployments, Supabase and live GitHub Pages were not modified. No paid plan or service subscription was enabled.

## Diagnosis

- Resend uses `Maker Quest <onboarding@resend.dev>`, a test sender restricted to the Resend account owner's email. A verified Resend domain is needed for other recipients. No Resend account integration is available in this session to inspect domain verification or delivery logs.
- Both before and after deployment, synthetic registration returned HTTP 200 with `emailVerified:false`; that response confirms registration, not email delivery. Inbox receipt has not been verified.
- The previous auth configuration trusted `https://maker-quest.vercel.app` while Cloudflare Pages used a different origin; serving the staging site and API on the Worker origin removes that cross-site cookie/CORS dependency.
- Password-reset sending was missing. Google OAuth credentials were absent from Worker bindings.
- Passport badges were local-only and Bot Battle's backend was a placeholder. Power Racers had no Cloudflare score submission.

## Local checks passed

TypeScript and Wrangler deployment packaging; registration with intercepted Resend; unverified-login rejection; verification links; password login; cookie session persistence; logout with server-side revocation; recovery links; password reset; invalidation of old password and sessions; one-use reset token; saved progress retained after recovery; account isolation; invalid-badge and cross-origin rejection; best-score retention and bounded scores for both games.

Chromium passed login, reload persistence, badge claim and reload, both leaderboard displays, logout, and locked passport while signed out. Local mail transport was mocked. Google was not exercised.

## Deployed checks

Registration, configuration endpoint and subsequent browser smoke checks use synthetic staging data. A single synthetic `@example.invalid` account was explicitly marked verified in staging D1 solely to exercise the deployed app. This is not an email-verification test. Synthetic records are retained to respect the instruction not to delete data.

Remote Chromium checks passed: password login; session persistence after reload; Maker Passport claim and reload; score writes and both leaderboard displays; logout; anonymous progress access denied; no browser JavaScript errors. Scores were submitted through the API using the authenticated browser. No full game rounds, real inbox delivery, or Google OAuth have been verified. Chromium's HTTPS verification is bypassed only in this environment's remote test runner because the intercepting proxy certificate is untrusted by that browser; this is not a certificate audit of the public site.

## Remaining access

Google OAuth client configuration/access to the correct Google Cloud project is required. Store the client secret directly in the staging Worker secrets, not in chat or Git. Authorized redirect URI:
`https://maker-quest-auth-staging.racerblur.workers.dev/api/auth/callback/google`.

For general email sign-up and password recovery, access to Resend and the sending domain's DNS is needed to verify a sender and inspect delivery. A real inbox test remains required. Google-only accounts use Google's recovery flow.
