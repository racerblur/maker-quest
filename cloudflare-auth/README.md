# Maker Quest — Better Auth / Cloudflare D1 (isolated scaffold)

This folder is **not deployed** by the current static Cloudflare Pages project. It is an isolated starting point for a future Cloudflare Worker authentication API. The existing GitHub Pages + Supabase app is unchanged.

Planned configuration:
- D1 binding: `DB` -> `maker-quest-staging-db`
- Separate authentication Worker, deployed only after configuring its URL, secrets, and database migrations.
- Use Better Auth with D1's SQLite interface, including account, session, user, and verification tables.
- Configure trusted origins to include only the staging Pages origin and the Worker API origin.
- Provide a secure email sender for verification and password resets before enabling public registration.
- No Supabase credentials or live user records should be copied into this test environment.

## Next implementation steps
1. Decide and provision a dedicated Worker URL (e.g. `maker-quest-auth-staging.<subdomain>.workers.dev`).
2. Add the Better Auth handler and D1 schema migrations, pin and test dependency versions, and configure `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` as Worker secrets/settings.
3. Set CORS, secure cookies, trusted origins, and email verification delivery.
4. Deploy the Worker, test sign-up/sign-in/session/logout, then add a staging-only login UI.
5. Only after tests, plan a controlled migration with account ID mapping and password-reset strategy.

Do not merge this staging scaffold into `main` or change the existing Pages production build settings until the new API has been tested.
