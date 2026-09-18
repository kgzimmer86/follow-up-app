# Follow Up | Michigan Cru

Production, mobile-first ministry follow-up app built with Next.js App Router, TypeScript, Supabase, and Vercel. Work from the existing app; preserve product terminology, permissions, visual style, and field workflows unless a change is explicitly requested.

## Maintenance references

- [Contact filters and verification](supabase/CONTACT_FILTER_DEPLOYMENT.md)
- [Interaction photos and permissions](supabase/INTERACTION_PHOTOS_DEPLOYMENT.md)
- [Text attempts and validation](supabase/TEXT_ATTEMPTS_DEPLOYMENT.md)

SQL files in `supabase/migrations` record database changes. The product owner runs complete SQL manually in Supabase SQL Editor when required. A GitHub push does not apply SQL. Do not rerun historical migrations simply because they appear in these notes.

## Development and validation

Use `npm run dev` for local development. Read `AGENTS.md` and the relevant installed guides in `node_modules/next/dist/docs/` before changing Next.js behavior.

For code changes, run `npm run build`, appropriate focused tests, and lint. In the current local Codex environment, Turbopack has encountered an OS restriction while processing CSS (process creation/port binding). `npm run build -- --webpack` provides an alternative production build check; report the standard-build failure separately rather than treating it as a pass.

- Lint: `npm run lint` (the existing startup-image `<img>` warning is known).
- Shared helper tests: `node --test src/lib/*.test.mjs`.
- Database test setup is documented in the feature notes. Use isolated invented data, not live student records.
- Documentation-only changes do not require an app build or a Supabase update.

## Loading and connection recovery

The root layout retains the logo/loading bar for app startup. Authenticated page content has its own Suspense boundary inside the app shell, using the existing blue navigation indicator while content loads. Keep header/navigation outside that page boundary. This does not eliminate network latency or prevent a real document reload from showing startup UI.

Home, Contact Details, Disciples, and the root layout use the shared account-access check. It retries temporary account/profile read failures once, then offers recovery. Confirmed signed-out, missing-profile, inactive, and disallowed-role results retain their existing restrictions. Do not treat an unsuccessful network request as proof that someone signed out, or grant access from a stale role. Other routes have not all been converted to this shared check.

After changes here, check fresh launch, navigation between pages/contact tabs, retry after a temporary failure, and the relevant role restrictions. Do not add Home smart-card count queries: those counts were removed.
