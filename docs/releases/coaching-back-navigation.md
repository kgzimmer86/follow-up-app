# Coaching Back navigation

Prepared on main; not yet committed, deployed, or browser-verified. Kyle owns release.

The coaching Back link now returns to its entry page instead of browser history:
My Disciples, Manage Leaders (including its query filters), the originating Manage
Area, or a parent coaching page. Contact round trips retain this destination.
Missing/invalid origins fall back to My Disciples. No permission or data changes.

## Release

No SQL required. No Supabase or manual configuration changes.

1. Commit only the following files on main, with summary
   `Fix coaching Back navigation after contact visits`:
   - `src/app/disciples/[discipleId]/page.tsx`
   - `src/app/disciples/disciple-contact-navigation.test.mjs`
   - `src/app/manage/leaders/page.tsx`
   - `src/app/manage/areas/[areaId]/page.tsx`
   - `src/components/follow-up/disciple-back-button.tsx`
   - `src/lib/coaching-navigation.ts`
   - `src/lib/coaching-navigation.test.mjs`
   - `docs/releases/coaching-back-navigation.md`
2. Push and wait for Vercel Ready.
3. From each entry page, open coaching, visit a contact, use Back to results,
   then coaching Back. Confirm the original entry page appears, not the contact.
   Repeat with a nested disciple and after refreshing the coaching page.

Leave unrelated AI drafts, testing-only SQL, and all stashes untouched.
This builds on the previously released disciple-contact-return fix.

## Verification

- `node --test src/lib/coaching-navigation.test.mjs src/app/disciples/disciple-contact-navigation.test.mjs`: 7 passed. Includes URL round trips, invalid origins, and source-wiring checks. Node emitted a non-failing module-type warning.
- Focused ESLint on the seven changed code/test files: passed.
- `node node_modules/next/dist/bin/next build --webpack`: passed, including TypeScript.
- Commands used the bundled Node runtime. Browser smoke checks remain pending;
  automated checks are not a substitute for those checks.
- Production commit, deployment, and live verification: pending Kyle.

Recovery: stop before pushing if an unexpected diff/conflict appears. If deployed
behavior fails, Kyle can revert this commit and push; no database rollback needed.
