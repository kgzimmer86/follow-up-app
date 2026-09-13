# Community Groups v1

## Deployment

**Hold production deployment pending final sign-off.** An isolated staging database is installed and the core manual workflows have passed. See `COMMUNITY_STAGING_RETEST.md` for current evidence and the narrower remaining checks. The steps below are for the eventual approved deployment, not instructions to run SQL now.

Apply `migrations/20260911_community_groups_foundation.sql` first, then `migrations/20260912_community_contact_results.sql` before deploying the matching application. Do not execute an old copied version. The second migration creates a separate group-scoped endpoint from the installed current contact-results function, with shape guards; it does not replace the normal Follow Up endpoint. Subsequent updates to the normal results function require refreshing this separate endpoint and running parity tests.

1. Review the SQL, then run the complete file once in Supabase SQL Editor. It is transactional. If Community tables already exist, it stops without changing them; inspect that deployment rather than deleting tables.
2. Confirm the transaction succeeds. Deploy the matching app code afterward. A Git push does not apply SQL.
3. In Community, staff/admins can create a group in their oversight area and select leaders. Add an invented test person through the normal existing-person search, take attendance, and check its Community tab before using real attendance.

No production data was used in automated tests and no live database migration has been executed by the agent.

## Behavior

- One campaign per academic year; Community defaults to the active campaign, with a latest-archive fallback when none is active. Staff/admins browse archived years through Community History. Archived groups are read-only and retain existing group-access rules. Community records follow the existing five-year campaign purge through cascading campaign deletion. Students are retained. The purge function itself is unchanged.
- Only the campaign's default area grants scope. No default means All Campus, matching the current user dropdown. Student leaders/disciplers must additionally be designated group leaders; staff/admins have all groups within scope. Inactive and pending accounts have no access. Old non-default assignments do not grant access.
- Multiple group memberships use the same student. A campaign contact is reused or created for an existing student when needed. New people use the existing field-added contact form and its duplicate checks. Importer scoring and survey precedence are unchanged; Check again now retains weak-match confirmations only when the matching evidence remains unchanged.
- Membership periods survive removal/restoration. Same-day restoration undoes a same-day removal; a later return creates a new period.
- Attendance is present/absent per dated meeting, with no attendance record before saving. Past meeting rosters use membership periods and existing attendance, not today's roster. Duplicate periods caused by a person merge do not double-count attendance.
- Saving checks both roster revision and meeting version. An outdated checklist is rejected. Failed saves retain selections; leaving an edited checklist warns. There is no offline attendance or background autosave in this version.
- Involved is the existing campaign contact status. Attendance alone never promotes it. Removing the final active membership of an involved student offers Keep Involved / Go back / Not interested / Cancel. Concurrent memberships are checked in the database, including groups outside the acting leader's visibility.
- The existing duplicate merge log triggers a transfer of Community memberships and attendance before deletion. For duplicate attendance entries, present wins. When both identities have active memberships in the same group, one active membership survives and the other period is retained as ended. No survey-selection rules change.
- Group settings edit the name, day, area and leaders. Ending the academic-year campaign archives its groups. A separate group deletion/archive action, invitations, tasks, needs-attention automation, import naming and reporting grids are deferred.

## Validation

Run `FOLLOW_UP_PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test supabase/tests/community-regression.test.mjs` for five additional compatibility checks using the exported public importer, Add Person, status and merge functions. They verify Keep current remains unchanged, Use newer retains missing fields and Follow Up progress/ownership, failed imports roll back, direct and importer-initiated merges preserve Community identity/attendance, and a failed Community merge hook rolls back the entire merge. Fixtures contain function definitions and invented records, not production contact data.

These are not a complete production clone: unexported normalization and progress-recalculation helpers are test doubles, and some supporting tables are reconstructed. They do not validate real fuzzy matching, every existing trigger/RLS policy, browser interactions, or genuinely concurrent database connections. Use an isolated staging Supabase project with the complete schema for those checks; never point write tests at production.

Run `FOLLOW_UP_PGLITE_MODULE=/path/to/@electric-sql/pglite/dist/index.js node --test supabase/tests/community.test.mjs` for isolated PostgreSQL integration checks. These cover area restrictions, non-default assignments, student/discipler designation, direct-write denial, shared identity/status, explicit absence, stale saves, last-group review, return periods, the merge-transfer trigger and archived-write rejection/campaign deletion. Existing status handling is represented by a minimal test function; the production status function is reused unchanged.

Also run `node --test src/lib/*.test.mjs`, `npm run lint`, and `npm run build -- --webpack`. The existing app-loading image lint warning is unrelated.

Before release, finish the focused staging navigation/history checks in COMMUNITY_V1_CHECKPOINT.md. Completed staging data-workflow tests need not all be repeated in production. After approved SQL/app deployment, perform a short smoke check: existing Follow Up contact loads, Community opens for the appropriate role, an approved invented test attendee can be saved/reopened, and unauthorized group access is denied. Expand testing if that reveals a discrepancy. Compilation and isolated SQL tests do not substitute for hosted checks.

## Rollback precautions

Before approved deployment, retain the previous app release and a verified database backup. If the new UI has a problem, restore the previous app release while leaving Community tables and the merge-transfer hook intact. Do not simply drop the hook: Community references can otherwise block existing duplicate merges. Do not drop Community tables to roll back after attendance has been recorded. A database rollback after real usage requires a separately reviewed data-preserving plan.
