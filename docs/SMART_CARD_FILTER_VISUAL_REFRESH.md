# Smart-card filter visual refresh — test preview

## Current revision — September 21, 2026 (supersedes the historical notes below)

Prepared on `codex/test-website` only. Production is not changed. Kyle applies SQL,
commits and pushes; no remote changes were made by the agent.

### Behavior

- Go Back, Share the Gospel, Meet Someone New, and Invite to CG no longer have
  Narrow further. No Address and View All Contacts retain all options. My Contacts
  and community-scoped lists also retain their existing extended options.
- Status and Affinity are checkbox dropdowns beside the area/gender controls.
  Multiple choices within a field use OR; different fields combine with AND.
- The yellow criteria box no longer repeats the Not Interested exclusion. Where
  the existing card excludes that status, it is disabled, unchecked, and locked.
  All other statuses start checked. View All Contacts retains its ability to show
  Not Interested. Clearing every status produces zero results. No affinities selected
  means Any affinity.
- The assigned affinity is selected on initial default-area entry and Clear Filters,
  including No Address. Explicit saved selections still take precedence; deliberately
  clearing an affinity must not silently reselect it. Multiple saved affinities travel
  between cards and are reflected in the Home context label.
- One Use my assigned area button remains at the bottom (as before, not on No Address).
- Removed advanced card-view choices are cleared on simplified cards so old links
  do not silently narrow results. Spreadsheet column controls remain available and
  their selections are preserved when changing another filter in spreadsheet mode.
- Checkbox changes use the existing 750ms multi-choice delay; other controls retain
  250ms. Fixed survey OR rules, contact permissions, and data remain unchanged.

### Testing-only release order

1. Confirm Supabase **Follow Up - Testing**, reference `tcbwepqkvnquxkbtaxcl`.
2. Run the complete `supabase/migrations/20260925_multi_status_affinity_filters.sql`.
   Both flags must be true for each returned reader. Stop on any error; do not
   replay older migrations. The transaction patches only the two filter comparisons
   in installed list/search/community readers, failing on unexpected shapes. It
   preserves signatures, permissions, fixed criteria, counts and pagination, changes
   no data, and can be rerun. This release is NOT approved for production.
3. Commit/push only these files on `codex/test-website`:
   - `src/components/follow-up/contact-results-page.tsx`
   - `src/components/follow-up/automatic-filter-form.tsx`
   - `src/components/follow-up/checkbox-filter-dropdown.tsx`
   - `src/components/follow-up/smart-card-filter-criteria.tsx`
   - `src/components/follow-up/smart-card-filter-criteria.test.mjs`
   - `src/lib/contact-filters.ts`
   - `src/lib/smart-card-filter-options.ts`
   - `src/lib/smart-card-filter-options.test.mjs`
   - `supabase/migrations/20260925_multi_status_affinity_filters.sql`
   - `supabase/tests/spreadsheet-progress-filters.test.mjs`
   - `docs/SMART_CARD_FILTER_VISUAL_REFRESH.md`
4. After Preview Ready, check mobile/desktop, multi-status and multi-affinity,
   none/all selections, locked status, affinity-default users, rapid checkbox changes,
   Clear Filters, assigned-area reset, card switching, and All Contacts name search.

Tests: 64 focused render/filter/database tests passed using invented in-memory data.
Full ESLint: zero errors, one existing app-loading image warning. Webpack production
build passed including TypeScript. Authenticated browser checks and test-database
application remain pending. Commands: `node --test` on contact-filters, filter-session,
spreadsheet-filter-options, smart-card-filter-options, smart-card-filter-criteria,
and supabase/tests/spreadsheet-progress-filters test files; `eslint`; `next build --webpack`.

Recovery: Kyle may revert this preview code revision and redeploy. The SQL supports
old single values unchanged, so it can remain installed. No data rollback is needed.
Any later production release requires review against current main; do not merge this
mixed test branch wholesale. No production SQL or Git changes are authorized here.

---

## Historical first visual-only revision (not the current deployment instructions)

Status: prepared locally on `codex/test-website`; not committed, pushed, or deployed
by the agent. Kyle reviews the preview before any production release.

## Scope

Copy refinement: the yellow heading uses the current card name (for example,
“Go Back Criteria” or “Invite to CG Criteria”). Removed the explanatory text under
Filters and Narrow further and the yellow-box footer. Your filters has only the
short area/gender sentence, using the same card name as the yellow heading rather
than “smart-card.” The Gospel OR explanation remains for clarity.

Yellow, locked criteria replace the gray summary. Gospel explicitly displays its
existing Jesus OR Interview rule, plus its existing status and KGP restrictions.
Other cards retain all their existing criteria. Fixed checks are display elements,
not form inputs, and cannot be submitted as personal filters.

Campus area, dorm/location, floor, wing/house #, and gender remain visible. Other
controls move into native “Narrow further” disclosure, with an active-filter count.
An active additional choice opens the disclosure on a fresh render. Collapsed
controls stay mounted and continue submitting their values. Spreadsheet-specific
controls and their existing responsive visibility are retained.

No query rules, cookies, filter reset behavior, automatic-apply delays, authorization,
header, or database changes. Existing Clear Filters and assigned-area buttons are
untouched. In this branch the latter is labeled “Use my assigned area”; this update
does not rename it or change what it does. No Show contacts button is introduced.

## Files for this change only

- `src/components/follow-up/contact-results-page.tsx`
- `src/components/follow-up/smart-card-filter-criteria.tsx`
- `src/components/follow-up/smart-card-filter-criteria.test.mjs`
- `docs/SMART_CARD_FILTER_VISUAL_REFRESH.md`

Exclude unrelated AI proposal/evaluation documents and test-only parity SQL.

## SQL and deployment order

**No SQL required in testing or production.** No environment changes required.
Kyle commits the four listed files and pushes `codex/test-website` for preview.
After approval, review the difference against current `main` and transfer only
these changes and their necessary dependencies; do not blindly merge a mixed test
branch. Kyle controls production commits, merges, and pushes.

## Checks

Local validation on 2026-09-20: initial 40 focused tests passed; after copy refinement,
all 41 focused tests, changed-file ESLint, and the webpack build passed. TypeScript
(`tsc --noEmit --incremental false`) passed; ESLint on the three changed source/test
files passed; `next build --webpack` passed. The standard Turbopack build was not
run for this change. No authenticated browser/preview checks have been completed.

- Render tests: `node --test src/components/follow-up/smart-card-filter-criteria.test.mjs`
- Filter regressions: `node --test src/lib/contact-filters.test.mjs src/lib/filter-session.test.mjs src/lib/spreadsheet-filter-options.test.mjs`
- Lint and production build; record results in the handoff.
- Preview manual checks (pending): mobile and desktop, Gospel OR and Community
  criteria, same results before/after, all five primary controls, additional filters
  expanded/collapsed, rapid Yes/Maybe selections, Clear Filters, assigned-area action,
  switching cards, back/forward, spreadsheet on desktop and cards on mobile.
- Confirm no additional submission occurs just from opening/closing the disclosure.

Recovery: revert just these presentation changes and redeploy the previous code.
There is no database rollback. Deployment and manual verification remain pending
until Kyle confirms them.
