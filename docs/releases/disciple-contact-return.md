# Return from contacts to My Disciples

## Scope and status

Prepared on `main`; Kyle commits and pushes. Not deployed or browser-verified yet.
Contact links in a disciple's Needs attention, Assigned Contacts, and Recent
Activity now carry their originating page and section. Existing contact tabs and
actions preserve that return destination. Direct contact visits retain the existing
My Contacts fallback. No filter logic, permissions, or contact data changes.

## Kyle's release steps

1. On `main`, commit only these files with summary `Fix contact return navigation from My Disciples`:
   - `src/app/disciples/[discipleId]/page.tsx`
   - `src/app/disciples/disciple-contact-navigation.test.mjs`
   - `docs/releases/disciple-contact-return.md`
2. Push using GitHub Desktop and wait for the production deployment to be Ready.
3. Open a contact from each of the two Needs attention queues and from Assigned
   Contacts. Switch contact tabs, then select Back to results. Confirm it returns
   to the same disciple and originating section. Also check Recent Activity.

Leave unrelated AI drafts, testing-only SQL, and stashed files untouched. Do not
merge the pending test-branch filter redesign as part of this release.

## Supabase

SQL required: **NONE**. No Supabase changes required. No manual settings changes.

## Verification

- `node --test src/app/disciples/disciple-contact-navigation.test.mjs`: 4 passed
  (source-wiring regression checks, not browser interaction tests).
- `node node_modules/eslint/bin/eslint.js 'src/app/disciples/[discipleId]/page.tsx' src/app/disciples/disciple-contact-navigation.test.mjs`: passed.
- `node node_modules/next/dist/bin/next build --webpack`: passed, including TypeScript.
- Browser and production smoke checks: pending Kyle's verification.

These commands used the bundled Node runtime because Node is not on the shell PATH.

## Recovery

If checks fail before pushing, stop and report the issue. After deployment, Kyle
can revert this code-only commit and push again; no database rollback is needed.
Production commit and live verification remain pending.
