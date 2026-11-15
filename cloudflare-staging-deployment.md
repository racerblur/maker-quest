# Maker Quest Cloudflare staging

This file is committed only to `cloudflare-better-auth-staging` to trigger a Cloudflare Pages Git deployment.

Cloudflare Pages project: `maker-quest` (`maker-quest.pages.dev`).
Production branch for this separate Cloudflare project: `cloudflare-better-auth-staging`.
D1 binding: `DB` -> `maker-quest-staging-db`.

This commit does not install Better Auth or create D1 tables. Do not merge into `main` as part of staging setup. Existing GitHub Pages and Supabase remain the live systems until an independently tested cutover.
