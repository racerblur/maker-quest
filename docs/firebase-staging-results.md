# Firebase staging results — November 17, 2026

Status: first migration slice deployed and tested. **Not ready for production.**

Staging: https://maker-quest-firebase-staging.web.app/staging/account.html

Firebase project: `maker-quest-firebase-staging`. Firestore Standard in
`us-east4` reports `freeTier: true`. No billing was enabled. Auth configuration,
rules/indexes and static hosting were deployed using the official Firebase CLI
with this explicit staging project ID. Hosting release version:
`357506dde16a2f51`.

## Executed tests

| Test | Result and scope |
| --- | --- |
| Firestore rule deployment | Passed backend compilation and deployment; database edition/location/free-tier inspected through CLI |
| Owner access / cross-user denial | Passed emulator integration: own profile create/read/update, other-user read/create/update/delete denied; collection enumeration and unauthenticated reads/writes denied |
| Schema constraints | Passed emulator integration: malformed types, oversized/empty names, extra fields, role/UID injection, missing fields, changed creation time and forged timestamps denied on create/update |
| Demo badge controls | Passed emulator integration: fixed badge IDs, own collection read, server timestamp creation, immutable award time, reset; cross-user and orphan creation denied |
| Prize and admin writes | Passed emulator integration: score creation/change/deletion, verified awards, event/reset configuration, run and admin client writes denied; authenticated server-written leader reads allowed |
| Guest linking and recovery | Passed emulator integration using a **mock Google token**: guest UID and saved badge preserved on link; later provider sign-in finds same UID; credential collision leaves another guest signed in. This is not real Google OAuth verification |
| Real staging guest flow | Passed Chromium: guest sign-in, display-name save, companion badge save, refresh, persisted state restored to another context, reset, logout and fresh guest isolation |
| Full browser restart | Passed real staging Chromium: persistent browser profile closed, Chromium process restarted, same guest account/display name restored |
| Google OAuth launch | Passed real staging: popup reached `accounts.google.com`. No real Google sign-in was completed by the test runner |
| Mobile page smoke | Passed Chromium at 390×844: landing, companion, Bot Battle, Power Racing load without uncaught script errors or horizontal overflow |
| Bot Battle smoke | Passed emulator-hosted and real staging builds: select spinner/flipper/ram, named competitor introduction, random CPU name present, battle starts, arena square, timer advances, keyboard actions sent, rebuild, CPU spectator match starts |
| Power Racing smoke | Passed emulator-hosted and real staging builds: expand setup, choose name and motor, start race, throttle consumes battery, brake/reverse actions sent, return to builder. These are smoke checks, not exhaustive physics or race-completion verification |
| Original sources preserved | Verified no diff from `main` for original six HTML files, media, or existing workflows; modifications are applied to staged build output only |
| Dependencies | `npm audit` reported 0 vulnerabilities after pinning patched `@grpc/grpc-js` 1.14.7 via override. Browser build remains bundled from modular Firebase SDK |

Five Node emulator integration tests passed. Four local Chromium browser tests
passed (real Google launch skipped locally). The final real staging Chromium
suite passed all six tests. Emulator logs include expected permission-denied
responses for negative tests. No production or legacy account data was used.
Synthetic guest accounts created during staging tests remain staging-only.

The environment's proxy certificate was not trusted by bundled Chromium, so
real staging browser checks used the opt-in test-only HTTPS exception. This is
not a TLS/certificate validation result. Python/CLI HTTPS requests used their
normal trust settings. No application or deployment code disables TLS checks.

## Still required

1. A real participant must complete Google sign-in on staging. Also test guest
   linking to a real unused Google identity, then recover its passport on a
   second device. Provider cancellation and collision should be confirmed with
   real accounts. The mock-provider test does not replace these checks.
2. Test actual iPhone Safari, including popup blocking, refresh/restart, guest
   linking, portrait/landscape, touch controls and audible audio. The execution
   environment has no iPhone. Chromium mobile viewport is not Safari evidence.
3. Build the trusted ranked-score/verified-award service, organizer controls,
   event resets and leaderboard UI integration. Ranked scores remain disabled;
   there is no claim of fraud-resistant scoring yet. Assess deterministic replay
   or authoritative simulation before awarding prizes from client games.
4. Implement safe account merging for credentials already belonging to a
   permanent account, with proof of both identities. Current behavior preserves
   the guest and reports the collision instead of losing its data.
5. Authorize Cloudflare and deploy the prepared, separately named static Worker;
   configure its actual hostname only in staging Firebase Auth and retest.
   No existing Cloudflare staging resource was changed.
6. Resolve the Vercel/repository mismatch and locate any real Supabase account
   and progress system before preparing a legacy importer. No legacy schema,
   accounts or progress were accessed or migrated.
7. Review quota limits for expected attendance, restrict staging access before
   wider testing, and rehearse rollback and any data reconciliation. No billing
   or paid service should be enabled without owner approval.

Rollback and architecture details are in `staging/README.md` and
`docs/firebase-migration-plan.md`. Existing websites, credentials, Cloudflare
Better Auth/D1 staging and any Supabase data remain untouched. Production
approval has not been requested because the acceptance matrix is incomplete.
