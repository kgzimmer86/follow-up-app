# Approved smart-card filters: production release

Kyle and Glen approved the test-site appearance and behavior on 2026-09-23.
Prepared directly on `main` from tested branch `codex/test-website` at `4df2f51`.
Main baseline: `4bb4247`. Commit/push/deployment remain Kyle's responsibility.
No whole-branch merge: unrelated next-step experiments, test banner, test-only
database corrections and duplicate-import changes are excluded. Recent main
navigation, assignment, Community search, copy cleanup and startup fixes are preserved.

## What changes

- Yellow card-specific criteria with an explicit OR group for Share the Gospel.
- Area, dorm, floor, wing, gender, Status and Affinity stay visible.
- Status/Affinity checkbox dropdowns support multiple selections: OR within each
  field, AND between fields and the existing fixed card rules.
- Not Interested remains locked out where the existing card excludes it. Other
  statuses start checked; unchecking all returns no matches. View All can include it.
- Assigned affinity defaults are selected unless explicitly overridden. Clear Filters
  restores defaults; selecting no affinities means Any. Saved affinities travel
  between cards and appear in the Home context.
- Narrow further is removed from Go Back, Gospel, Meet Someone New and Invite to CG;
  No Address, View All, My Contacts and Community lists retain extended options.

### Follow-up adjustment — September 23

Supersedes the Narrow further rule above: Go Back and Meet Someone New now retain
extended filters too; only Share the Gospel and Invite to CG hide them. Status and
Affinity use matching light borders/padding and right-side up/down chevrons with
the native left disclosure marker hidden, while retaining checkbox behavior and locks.
No SQL required; the previously applied multi-selection SQL is unchanged.
Kyle commits/pushes only the five files for this adjustment:
`smart-card-filter-options.ts`, `smart-card-filter-options.test.mjs`,
`checkbox-filter-dropdown.tsx`, `smart-card-filter-criteria.test.mjs`, and this document.
Verify expanded filters on Go Back/New, absence on Gospel/CG, and both checkbox
dropdowns on iPhone. Rollback is reverting this code-only adjustment; no data rollback.
- Removed advanced card-view choices are cleared to avoid invisible restrictions;
  spreadsheet choices remain preserved. Existing automatic delays stay 750ms for
  multiple choices and 250ms otherwise. One assigned-area button remains below.

## Kyle's ordered release steps

1. Confirm the **production Supabase project**, not Follow Up - Testing
   (`tcbwepqkvnquxkbtaxcl`). Production reference must be confirmed in the dashboard.
2. Copy and run the entire
   [20260925_multi_status_affinity_filters.sql](../supabase/migrations/20260925_multi_status_affinity_filters.sql).
   Expect three readers (`get_follow_up_contact_results_v2`,
   `get_follow_up_contact_results_search`, `get_community_contact_results`), each
   with `multiple_statuses = true` and `multiple_affinities = true`.
   Stop if there is any error or an unexpected/missing row. Do not replay migrations.
3. Only after SQL verification, commit the eleven files below on `main` and push.
   Summary: `Release approved smart-card filter improvements`.
4. Wait for the matching Vercel commit to be Ready. Check mobile filters, two status
   selections, locked Not Interested, multiple affinities, assigned affinity defaults,
   Clear Filters, card switching, All Contacts name search and desktop spreadsheet.

## Exact release files

- `src/components/follow-up/automatic-filter-form.tsx`
- `src/components/follow-up/contact-results-page.tsx`
- `src/components/follow-up/checkbox-filter-dropdown.tsx`
- `src/components/follow-up/smart-card-filter-criteria.tsx`
- `src/components/follow-up/smart-card-filter-criteria.test.mjs`
- `src/lib/contact-filters.ts`
- `src/lib/smart-card-filter-options.ts`
- `src/lib/smart-card-filter-options.test.mjs`
- `supabase/migrations/20260925_multi_status_affinity_filters.sql`
- `supabase/tests/spreadsheet-progress-filters.test.mjs`
- `docs/SMART_CARD_FILTER_VISUAL_REFRESH.md`

## SQL safety and compatibility

One transactional SQL file patches only the status and affinity comparisons in
installed readers. It checks expected function shapes and aborts on mismatch.
Rerunning is supported. Only its introductory comment differs from the SQL already
verified in testing (Kyle reported all three readers true/true). Function signatures,
permissions, fixed criteria, counts and pagination remain intact. No records,
assignments or history are changed. No new settings, credentials, or grants.
The old single-value UI remains compatible during the SQL-before-code interval.
No data backup/restore is needed for this read-query-only patch.

## Verification and status

Preview: Kyle/Glen approved; testing SQL confirmed successful earlier.
Production SQL: pending Kyle. Code commit/deployment/live smoke check: pending Kyle.
Current-main verification: 64 focused tests passed using `node --test` on
`src/lib/contact-filters.test.mjs`, `src/lib/filter-session.test.mjs`,
`src/lib/spreadsheet-filter-options.test.mjs`, `src/lib/smart-card-filter-options.test.mjs`,
`src/components/follow-up/smart-card-filter-criteria.test.mjs`, and
`supabase/tests/spreadsheet-progress-filters.test.mjs`.
`next build --webpack` passed including TypeScript. A test-only variable was renamed
to satisfy current Next.js lint rules; it does not affect application behavior.
Final full ESLint: zero errors, only the existing app-loading image warning.
The seven render tests passed again after the test-only rename.
Local tests use invented data only, not production. Authenticated live checks remain
Kyle's responsibility and aren't replaced by automated tests.

## Recovery

If SQL fails, stop before deploying: its transaction rolls back. If code fails after
deployment, Kyle can revert just this release commit to `4bb4247`; leave the compatible
SQL installed. No data rollback is required. Do not merge/revert the entire test branch.
