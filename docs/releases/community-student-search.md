# Community roster and attendance search

## Behavior

Both Add Attender entry points now show name, uniqname (email fallback), and
dorm/location. Missing details are explicitly labeled. Search still matches names,
uniqnames, and U-M email across campus; it does not change membership or attendance.

Matching results are ordered before the 30-result limit:

1. Current campaign default ministry assignments of the group's active leaders,
   including descendants of assigned geographic areas and assigned affinity members.
2. The parent geographic area and its other locations.
3. All other matches, including people without a contact in this campaign.

Each tier is alphabetical, then student ID for stable ties. Co-leaders' assignments
are combined. Historical/non-default assignments and inactive leaders do not count.
The searching staff member's own assignments do not change ranking. An affinity
assignment has no geographic second tier unless it also has a geographic assignment.
Without assigned areas, results remain alphabetical across campus. Dorm labels use
the group's campaign contact, with raw location as fallback; old campaign dorms
are not presented as current. Search text is literal, case-insensitive, 2–200 characters.

## Kyle's release steps

1. Confirm you have the **live production Supabase project**, not Follow Up - Testing
   (`tcbwepqkvnquxkbtaxcl`). Production reference still requires Kyle's confirmation.
2. Before pushing code, copy and run the entire
   [20260926_community_student_search.sql](../../supabase/migrations/20260926_community_student_search.sql).
   Its final verification must return `search_exists = true` and
   `search_permissions_correct = true`. Stop on any error; do not replay older migrations.
3. In GitHub Desktop on `main`, commit only the four files below, using summary
   `Show dorms and prioritize nearby Community search results`, then push.
4. After Vercel is Ready for that commit, test searches in both the roster and
   attendance Add Attender controls. Confirm names/uniqnames/dorms and priority for
   known matching contacts in a leader's dorm, sibling dorm, and elsewhere. Search
   alone does not write data. Avoid adding real roster entries merely as a test.

## Exact scope

Prepared directly on `main`, base `442dd9bc3cb675dd26b3c55e88be0c0e682113c3`.
Release commit: pending Kyle's commit.

- `src/components/community/group-controls.tsx`
- `supabase/migrations/20260926_community_student_search.sql`
- `supabase/tests/community-student-search.test.mjs`
- `docs/releases/community-student-search.md`

No test-branch filter changes, settings, credentials, or unrelated files ship.
SQL SHA-256: `77101179856beec099fefd493d3165a648e3d1f76d6d616bb6da9479b0d88479`.

## Database safety and compatibility

One additive search function; existing live code works unchanged after SQL is applied.
Requires existing Community groups/authorization, student/contact/area tables, and
affinity membership. Runs transactionally; the same file can be rerun. Does not alter
tables, RLS, contacts, assignments, history, membership, or attendance. No data backup
is needed for this read-only function addition. No configuration changes required.

The security-definer function has an empty search path and qualified references;
only authenticated callers can execute it. Existing group access authorization is
required, along with an active group/campaign. Anonymous/unrelated/pending callers
cannot use it. It exposes only student identity and campaign location for this
existing campus-wide lookup, not phone, notes, room, or other contact details.

## Verification

- `node --test supabase/tests/community-student-search.test.mjs supabase/tests/community.test.mjs`:
  passed, 3 tests, 0 failures. Synthetic isolated PGlite data only;
  tests load real foundational Community permissions, not a production database copy.
- `node node_modules/eslint/bin/eslint.js`: passed, zero errors; one pre-existing
  image warning in `src/components/follow-up/app-loading.tsx`.
- `node node_modules/next/dist/bin/next build --webpack`: passed, including TypeScript.
- Browser/mobile and live data smoke checks: pending Kyle; not claimed tested here.

## Recovery and status

If SQL fails, stop before pushing; existing live code is unaffected. If deployment
or live smoke checks fail, Kyle can revert this code release to the base above.
Leave the unused additive SQL function installed; no data rollback is required.
Any corrective production action remains Kyle's decision.

Production SQL: **not run by agent / awaiting Kyle**. Shared test SQL: **not run**.
Code committed/pushed/deployed: **pending Kyle**. Live verification: **pending**.
