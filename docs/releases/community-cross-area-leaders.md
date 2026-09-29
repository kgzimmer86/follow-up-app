# Community group leader management handoff

## Summary and status

- Prepared on `codex/test-website`; not deployed to production.
- Staff and admins can manage active group leaders from a Management tab. Search covers active leaders with a default assignment in the group's campaign across campus areas, with the manager's campus listed first. A selected leader can access the group from another campus.
- The missing-room filter, menu icon, recent interaction details, and contacts navigation are separate code commits: `26dc9d7`, `a86c651`, `0f7f584`, `a9cbd9f`. The group management commit contains this handoff, its code, SQL, and test.
- Preview and test database application: pending. A successful local fixture test is not evidence that SQL was applied to the shared test project.

## Kyle's ordered release steps

1. Confirm the production Supabase project identity and that `20260911_community_groups_foundation.sql` was applied. Stop if either is uncertain.
2. After approval, run the entire [cross-area leader migration](../../supabase/migrations/20260928_community_cross_area_leaders.sql) in production SQL Editor. Verify the final query reports `authenticated_can_execute = true`, `anon_can_execute = false`. Stop on any error.
3. Transfer the five reviewed commits and only their listed files to `main`, then deploy the approved code. The migration is compatible with the currently live code.
4. Confirm the deployed commit is Ready. As staff, open an active group's Management tab, search for a leader from another campus, save, reload, and confirm the leader can access the group. Check that an unrelated staff member cannot access it.

## Supabase

- SQL required: **YES**. Complete file: [20260928_community_cross_area_leaders.sql](../../supabase/migrations/20260928_community_cross_area_leaders.sql), before code deployment.
- Production project reference: Kyle must verify; it is intentionally absent here. Testing project reference: `tcbwepqkvnquxkbtaxcl`, but this migration has **not** been applied there.
- Prerequisite: community group foundation functions and tables. The migration checks their presence and stops if missing.
- Transaction: function changes and grants are atomic; rerunning replaces the same functions. The final query is read-only verification.
- Data impact: none on application; saving leaders later replaces the selected group's leader set and increments its revision. The save rejects stale revisions and an empty leader set.
- Privileges: authenticated may execute the new function; anon and public cannot. The function requires an active staff or admin who can access the group. The existing group-save function accepts active leaders assigned to any campus area, so later group edits preserve cross-campus leaders. Cross-campus group access is granted only to active profiles explicitly listed as its leaders.
- Recovery: before code deployment, leave the additive function in place. If code needs rollback after deployment, restore the prior approved code; do not automatically remove cross-campus leader access or memberships. Review affected groups and seek Kyle's approval before any corrective data or permission change.

## GitHub and verification

- Source branch: `codex/test-website`; target: `main` after review. Do not merge the whole long-lived test branch without reviewing its diff against approved `main`.
- Files for this change set: `src/components/follow-up/contact-results-page.tsx`, `src/components/follow-up/app-shell.tsx`, `src/app/community/groups/[groupId]/page.tsx`, `src/components/community/group-settings.tsx`, `src/components/community/group-leader-management.tsx`, `supabase/migrations/20260928_community_cross_area_leaders.sql`, `supabase/tests/community-cross-area-leaders.test.mjs`, and this handoff.
- Exclude `Glen_scratchpad.txt` and all local environment files.
- `npm run lint`: passed with one existing `app-loading.tsx` image warning.
- `npm run build`: passed.
- `node --test src/lib/contact-filters.test.mjs src/lib/filter-session.test.mjs`: 31 passed.
- `node --test supabase/tests/community.test.mjs supabase/tests/community-v2.test.mjs supabase/tests/community-cross-area-leaders.test.mjs`: 5 passed, including denied access, cross-campus membership, and stale revision.
- Manual mobile/desktop and shared test project checks: pending. Production SQL, deployment, and smoke checks: pending Kyle's confirmation.
