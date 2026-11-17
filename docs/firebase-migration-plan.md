# Maker Quest Firebase staging plan

Inspection date: November 17, 2026. Base: `main` at
`bbf55368c404949448850b5c0be1f97e3e6d984d`. Work branch:
`firebase-migration-staging`. This is an inspection and implementation plan,
not a completed migration or production recommendation. The subsequent staging
implementation and executed checks are recorded in `firebase-staging-results.md`.

## Verified application and deployment boundary

- The repository contains six static HTML pages, media, and two audio-generation
  GitHub workflows. No package manifest, active auth SDK, backend, schema export,
  automated tests, or hosting configuration exists on `main`.
- `companion.html` keeps four demo badges in browser localStorage under
  `maker-quest-companion-demo-passport-v1`. Schedule status previews are local too.
  `index.html` has a separate three-badge in-memory demonstration.
- `bot-battle.html` has a Supabase URL and an empty key placeholder, but no active
  connection. `loadLeaders()` displays a pending message and `submitScore()`
  displays a locally calculated score. It groups rounds by New York hour.
- `power-racers.html` has gameplay and vehicle choices, but no online score
  submission or persistent leaderboard. Adding these is new backend work, not
  preserving an existing online implementation.
- GitHub Pages returned HTTP 200 and byte-identical copies of all four inspected
  pages (`index`, `companion`, `bot-battle`, `power-racers`).
- The Vercel root returned a different application titled
  `Maker Quest | Cesta Prototýpka`; its `main.js` has age groups and missions.
  The three companion/game URLs returned 404. Neither its inspected HTML nor
  `main.js` mentions Supabase. Do not assume this deployment is this repository.
- `cloudflare-better-auth-staging` adds only a Better Auth/D1 Worker and auth
  test scaffolding; existing application files match `main`. Its notes identify
  that branch as the production branch of a separate Cloudflare Pages project.
  Keep that branch, Worker, D1 database, and secrets intact.
- The two audio workflows can push directly to `main` if triggered. Do not edit
  or dispatch them during this migration. No migration deployment workflow is
  present. External Vercel/Cloudflare Git integrations have not been inspected.

## Architecture decision

Preferred target: Cloudflare static hosting, Firebase Google/anonymous Auth,
Firestore as the single application database, and a narrow Cloudflare API for
trusted awards, ranked scores, and event administration. Do not add application
data to D1 as well. Retain the old D1 authentication database only for rollback
until an approved retirement. No Resend repair is planned.

Firestore integrates directly with Firebase identities and avoids separate
identity mapping for routine participant reads. D1 would require implementing
every data access through a Worker, Firebase token verification, authorization,
and a second data access model. Reconsider D1 only if verified legacy records or
measured event volume make that materially simpler or cheaper.

Keep Firebase on Spark initially. Do not enable billing, Identity Platform,
phone/SMS auth, Cloud Functions, paid extensions, or a paid Cloudflare plan.
Google and anonymous sign-in plus a small Firestore database may fit no-cost
quotas; confirm current project eligibility and published quotas before setup.
The trusted Worker and its Firestore access need explicit quota and credential
review before deployment. Budget alerts are not spending caps. Choose the
Firestore region deliberately before database creation; record it with event
location and expected audience once project access is available.

## Staged implementation sequence

1. Create a separate Firebase project (owner authorized this on November 17).
   Obtain account authorization using the official Firebase CLI. Never reuse
   production credentials or change an existing project's providers.
2. Add a staging-only test entry point, a pinned SDK build, and local Auth and
   Firestore emulators. Keep the six existing HTML pages and assets unchanged
   until auth and authorization tests pass. Use an explicit project ID for all
   deploys; avoid an implicit default project.
3. Configure Google and anonymous providers, a support contact, and only the
   isolated staging domain. Do not configure production domains yet. Start with
   a separate Cloudflare Worker/asset deployment with no production routes and
   no Git auto-deploy. Include noindex and a visible staging notice.
4. Use persistent Firebase browser sessions, wait for initial auth restoration,
   and expose explicit guest, Google, link, and logout actions. Attempt Google
   popup from the user's click; handle popup blocking and provider errors.
   Verify iPhone Safari before adopting redirect fallback: cross-origin auth
   redirects can fail under storage restrictions and may need a same-origin
   auth helper proxy. A successful build does not prove sign-in works.
5. Link a guest using Firebase provider linking so the UID stays stable. If the
   Google credential belongs to an existing account, preserve the guest data
   and use an authenticated server merge with proof of both identities. Never
   merge merely because email addresses match. Clearly explain that an unlinked
   guest cannot recover progress on another device. Google handles permanent
   account recovery; no custom email-verification flow is needed.
6. Connect the companion passport after the isolated test page passes. Keep the
   existing local demo distinct. Offer explicit import into a demo-progress
   namespace; local badges cannot become verified prize awards. Clear UI state
   and unsubscribe on logout/account switch to prevent showing another user's
   cached progress. Show offline/pending and failed-save states truthfully.
7. Connect game scores through a trusted API, preserving game code, visuals,
   audio, score formula, CPU modes, and existing New York round behavior.
   Treat the current scores as unverified until trusted validation exists.
8. Deploy to staging only, run the acceptance matrix below, and present actual
   results. Production merge, DNS changes, production routes, and cutover need
   explicit owner approval.

## Data and authorization model

- Private participant profile and demo progress keyed by Firebase UID. Permit
  owner-only reads and narrowly validated writes; cap display-name length,
  field names, types, badge IDs, and document sizes. Do not expose email through
  public profiles or leaderboards.
- Separate event ID and immutable round ID namespace for awards and scores.
  A reset advances the active round via an authorized administrator action,
  retaining history instead of deleting participant identities or awards.
- Verified badge awards are server-only. Validate a booth staff action or
  expiring single-use challenge proof, bound to the event and participant.
  A public QR containing only a badge ID is insufficient for prize eligibility.
- Public leaderboard entries contain only a moderated display name, score,
  game, event, round, and completion time. All ranked writes are server-only;
  clients cannot assign admin flags or write another user's data.
- Verify Firebase JWT signature, algorithm, issuer, audience, expiry and subject
  in the API. Refresh signing keys safely. Restrict CORS and request sizes;
  enforce per-user quotas and replay protection. Store service credentials only
  as restricted staging Worker secrets. Firebase web configuration is public,
  but it does not replace authorization.
- Checking score ranges or requiring sign-in does not prevent forged results.
  Use server-issued single-use runs and deterministic replay validation or
  authoritative simulation for ranked prizes. Until implemented and tested,
  keep submissions unranked and do not claim fraud resistance. CPU-vs-CPU and
  local versus games do not submit ranked player scores.

## Legacy migration and rollback

No Supabase accounts or progress were found in this source. No service database
was accessed or exported. Before any production migration, locate the actual
legacy project/source, inspect its schema read-only, and inventory account,
badge, event, reset, and score records. The deployment mismatch must be resolved
before claiming the brief's live authentication was migrated.

Prepare an encrypted backup and a dry-run importer with counts, checksums,
collision reporting, and an audit trail. Use a server-owned legacy-ID-to-Firebase-
UID mapping only after proving ownership. Match neither email nor participant
display name alone. Preserve earned awards and provenance; never silently
promote local demo achievements. Plan recovery for legacy users who cannot
prove access. Do not delete or overwrite old records during staged testing.

Staging rollback: disable the new staging deployment and revoke only its
credentials; main, GitHub Pages, Vercel, and old Cloudflare staging remain
unchanged. Before approved production cutover, record deployment identifiers,
database backups, identity mapping and a write-freeze/reconciliation procedure.
Keep old auth/data available through a defined rollback window. Avoid parallel
unreconciled writes; restoring old code alone cannot recover new Firebase-only
progress. Rehearse rollback with staging test records first.

## Acceptance evidence required

Executed at the initial planning checkpoint: repository/branch inspection, source dependency searches,
comparison of the Cloudflare branch, and read-only HTTP/source comparisons of
the two public deployments. No auth, persistence, access-control, gameplay,
Safari, or deployment acceptance test has passed yet.

Required before recommending production:

| Area | Evidence required |
| --- | --- |
| Google/guest auth | Real staging sign-in, errors, cancellation, logout |
| Sessions | Refresh and full browser restart, token refresh, expired session |
| Linking | Same guest UID retained; collision preserves both accounts' data |
| Passport | Save/reload, second-device recovery, concurrent updates, offline failure |
| Authorization | Anonymous/unauthenticated denials; cross-user read/write denial; malformed fields; client admin/score/award writes denied |
| Trusted API | Expired/wrong-project tokens, replayed runs/proofs, invalid scores, rate limits, admin reset denial and success |
| Leaderboards | Correct event/round, ordering, reset boundary, names escaped, duplicate submission prevention |
| Bot Battle | Solo/CPU/versus, build choices, introductions, square arena, score formula, audio |
| Power Racing | Throttle/brake/reverse, AI, obstacles, building choices, audio |
| Mobile/design | Actual iPhone Safari, portrait/landscape, carousel/navigation, no horizontal overflow, K-9 and branding unchanged |
| Operations | Isolated staging URL, quota review, no secrets in bundle, rehearsed rollback |

Use emulator integration tests for access controls and persistence; real Google
OAuth and Safari require real staging verification. Document each result and
remaining manual check separately. Do not equate emulator, compile, or HTTP
success with completion of this matrix.
