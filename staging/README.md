# Firebase migration staging

This branch is a first migration slice, not a production cutover. Do not merge
it or switch a production hosting branch until the remaining acceptance work
in `docs/firebase-migration-plan.md` and `docs/firebase-staging-results.md` is
complete and the owner approves.

## Isolated services

- Firebase project: `maker-quest-firebase-staging` (new project, no billing enabled).
- Firebase Web app: `1:968832083168:web:36fa190761e4db87881c85`.
- Firestore: `(default)`, Standard, `us-east4`, reports `freeTier: true`.
- Google and anonymous Auth enabled via the official Firebase CLI. No password,
  email verification, SMS, or Resend flow is used.
- Temporary staging hosting: https://maker-quest-firebase-staging.web.app
- Account test: https://maker-quest-firebase-staging.web.app/staging/account.html

Cloudflare hosting remains the preferred target. Wrangler reported no authorized
account. `staging/wrangler.jsonc` prepares a **new** static-assets Worker with no
production routes or D1 binding. Do not deploy over the old auth Worker or Pages
project. After Cloudflare authorization, build and deploy this configuration,
then authorize only the actual new Worker hostname in staging Firebase Auth and
repeat the auth/browser checks. No Cloudflare service was changed in this slice.

The Firebase project uses its default hosting channel exclusively for staging;
neither production website uses this project. There is no automatic deployment
workflow, Git integration, production domain binding, or paid backend.

## Build and tests

Use Node 24 and Java 21+. Install with `npm ci`, then `npm run build`.
The build copies the six original HTML pages and assets, adds a staging account
bar and bundled SDK, and adds a companion passport bridge **only in `dist/`**.
The original HTML, artwork, audio, carousel and game source are untouched.
Only `dist/` is published; scripts, tests, logs and configuration stay private.

Security/auth integration and browser tests run with:

```sh
npx -y firebase-tools@latest emulators:exec --only auth,firestore \
  --project demo-maker-quest 'npm run test:emulators && npm run test:browser'
```

Serve `dist/` and use `?emulator` on loopback to exercise local Auth/Firestore.
The client substitutes a demo project ID, never a staging token, in emulator
mode. The build does not enable emulator mode on a remote hostname.

Real staging browser checks:

```sh
TEST_BASE_URL=https://maker-quest-firebase-staging.web.app npm run test:browser
```

The managed execution environment used workspace directories for npm, Firebase
CLI configuration, emulator binaries and Playwright browsers. Those paths and
credentials are not part of the repository. Install Playwright Chromium with
`npx playwright install chromium` if needed. The optional
`TEST_IGNORE_HTTPS_ERRORS=true` is for this test environment's certificate proxy
only; do not enable it to validate a site's TLS setup. No app code disables TLS.

Every Firebase deployment must specify `--project maker-quest-firebase-staging`.
Do not run an implicit-project deployment or deploy Functions/paid services.

## Participant behavior and limits

- Explicit guest or Google entry, persistent browser sessions, secure SDK logout.
- A guest links Google via `linkWithPopup`, retaining UID and demo badges.
  Credential collisions show an error and preserve the guest rather than
  silently signing into a different account. Automatic merging is not provided.
- The account page stores a bounded display name separately from Auth email.
  It reads only the participant document and that UID's fixed demo badge set.
- Companion badges sync while signed in. Each badge has its own document to
  avoid overwriting unrelated badges across devices. Reset deletes demo badges
  only. Local storage is imported only by an explicit account-page action and
  is never promoted into verified attendance or prize eligibility.
- Listeners stop and rendered account data clears on account changes. Logout
  of an unlinked guest warns about lost access. Offline/unconfirmed writes
  are shown as pending; account editing waits for server confirmation.
- Landing-page sponsor badges remain a separate ephemeral demo. They are not
  silently merged with the companion passport.
- Game leaderboards and verified awards remain disabled for client writes.
  There is no trusted ranked-score service, organizer admin UI, or prize reset
  service yet. The rules reserve server-written event/round leaderboard paths;
  authenticated reads are permitted but no leaderboard UI queries them yet.
- Firestore is the only new application database. Existing D1 and any Supabase
  services have not been modified or removed.

## Rollback

This staging release has no production dependency. Stop publishing or disable
only the new staging Hosting site/Worker to withdraw it. Leave existing sites,
Cloudflare auth staging, and data intact. For staging code rollback, deploy an
earlier recorded Hosting version or rebuild a known staging commit with the
same explicit project ID. Keep the staging database while investigating issues;
do not delete user data to roll back UI code.

Production rollback and legacy-account migration still require the read-only
inventory, backups, identity ownership proofs and reconciliation rehearsal
described in the migration plan. A source-code rollback does not move new
Firestore-only progress into an old database.
