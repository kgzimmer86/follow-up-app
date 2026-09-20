# Smart-card filter visual refresh — test preview

Status: prepared locally on `codex/test-website`; not committed, pushed, or deployed
by the agent. Kyle reviews the preview before any production release.

## Scope

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

Local validation on 2026-09-20: all 40 focused tests passed; TypeScript
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
