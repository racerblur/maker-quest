# Maker Quest — isolated Cloudflare staging

This folder is experimental. Production GitHub Pages (`main`) and the existing Supabase project must remain unchanged.

## Target architecture
- Cloudflare Pages hosts a separate staging site.
- Cloudflare Worker handles `/api/auth/*` with Better Auth and a D1 binding.
- Cloudflare D1 stores staging authentication records and game data, independent of Supabase.
- Use a distinct staging URL, D1 database, Worker secrets, and OAuth/email configuration.

## Safety rules
1. Do not deploy this branch to the existing GitHub Pages production URL.
2. Never embed D1 credentials, Cloudflare API tokens, Better Auth secrets, or email provider secrets in source control or client-side JavaScript.
3. Never use Supabase service-role credentials in the staging client.
4. Use only synthetic test accounts initially; do not migrate production password hashes.
5. Do not copy private CRM data to staging.
6. Before a future cutover, export and reconcile user identities, scores, badges, and organizer roles; test rollback.

## Next implementation steps
1. Inventory all production app files and Supabase dependencies.
2. Set up a separate Cloudflare account/project deployment target and D1 database.
3. Scaffold a Worker with Better Auth, D1 adapter, and migrations using currently supported package versions.
4. Configure an email sender for verification and password resets.
5. Add a staging-only frontend API configuration and test end-to-end.

No Cloudflare resources have been provisioned by this commit. No production configuration has been modified.
