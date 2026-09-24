# Assign Invitations filter consistency

Prepared on main, not deployed. Removes the general filter descriptions and adds
Status/Affinity checkbox dropdowns with the same right-side chevrons as contact lists.
All statuses (including Not Interested) remain available, as before. All statuses
start selected; none selected returns no results. No affinities selected means Any.
Selections are OR within each field and AND across fields. Existing default affinity,
clear/reset, remembered filters, debounce, selection reset, permissions, roster scope,
search and pagination remain in place. No changes to My Invitations' simple selectors.

## Kyle's order

1. Confirm production Supabase, then run the entire
   [20260927_invitation_multi_filters.sql](../../supabase/migrations/20260927_invitation_multi_filters.sql).
   Expect two readers, both with true/true. Stop on errors or unexpected rows.
2. Commit/push the following on main only after SQL succeeds:
   - `src/components/community/invitation-contact-filters.tsx`
   - `src/components/follow-up/checkbox-filter-dropdown.tsx`
   - `supabase/migrations/20260927_invitation_multi_filters.sql`
   - `supabase/tests/invitation-contact-filters.test.mjs`
   - `docs/releases/invitation-multi-filters.md`
   The shared dropdown file also contains Kyle's approved, still-pending right-arrow
   styling. The other pending Go Back/New filter files can ship in the same commit
   if Kyle chooses; see `docs/SMART_CARD_FILTER_VISUAL_REFRESH.md` for that file list.
3. After Vercel Ready, verify two statuses, two affinities, none/all status, clear,
   default area, roster restriction and rapid checkbox clicks on mobile/desktop.
   Also check the shared dropdowns still submit normally on smart cards.

SQL is transactional, repeatable, and changes only two comparisons in each of the
two installed invitation readers. Missing/unexpected definitions abort. Signatures,
permissions, assignment eligibility and data are untouched; old UI remains compatible.
No data backup/rollback required. Never replay older invitation reader migrations.
Recovery: Kyle reverts only the new code commit; the compatible SQL can remain.
Production SQL and deployment: pending Kyle. Device verification: pending.

Validation: 12 tests passed via `node --test supabase/tests/invitation-contact-filters.test.mjs
src/lib/smart-card-filter-options.test.mjs src/components/follow-up/smart-card-filter-criteria.test.mjs`.
Tests cover both invitation readers, repeated migration, single-value compatibility,
multiple values, empty status, pagination, assignment eligibility and denied access
using invented in-memory data. Full ESLint: zero errors, existing app-loading image
warning only. `next build --webpack`: passed including TypeScript.
