# Invitation release review — September 14, 2026

All five production migrations were reported successful by the user after the
seven read-only preflight checks passed. Application commit/push is next.
Rollback deployment confirmed by the user: follow-up-ahxjgf07a-michigan-cru.vercel.app.
The user runs SQL and commits /
pushes through GitHub Desktop. Do not push before all database steps succeed.

## Verification

- Production build and TypeScript passed.
- Lint: zero errors, one existing app-loading.tsx image warning.
- 94 src/lib helper tests passed.
- 19 local database tests passed: invitation*.test.mjs, community.test.mjs,
  community-v2.test.mjs, community-regression.test.mjs, real-ministry-areas.test.mjs.
- These use invented records and reconstructed schemas; the void interaction
  regression uses the function supplied from testing. No production data accessed.
- User manual passes: single immediate spreadsheet assignment without scrolling
  jumps; bulk assign/cancel; reassignment and recipient list delivery; self-claim;
  assignable-only cards and gray unavailable rows; 72-hour cue, reminder reset,
  event closure clearing cues; event interaction Coming plus correct history.
- Recipient boundaries across real authenticated area/chain accounts remain
  manual-unverified. Local tests cover the full chain and area descendants.
- No exhaustive browser/viewport/security or hosted latency audit claimed.
- User supplied screenshots of all 43 changed filenames. They match the release
  source, migrations, documentation and invented-data fixtures. This was a filename
  review, not a full Git diff review; git CLI requires missing developer tools.

## Production sequence

First run `ready-to-run-invitation-release-preflight.sql` read-only in production.
Inspect results; PASS does not install anything or replace migration shape guards.
Confirm current rollback deployment with the user (do not assume an old URL is
still the immediately previous production release). Existing user-held backups
were readable; full restoration was not tested. Never access them without permission.

After explicit approval, guide the user through ONE migration at a time:

1. migrations/20260915_invitation_assignments.sql
2. migrations/20260915_invitation_contact_filters.sql
3. migrations/20260916_invitation_recipient_choices.sql
4. migrations/20260916_invitation_assignable_results.sql
5. migrations/20260916_invitation_interaction_return.sql

All five were reported successful in testing, including the final interaction fix.
Stop on an error; do not drop objects or blindly rerun migration 1.
Do NOT run tests/ SQL seed, ministry-area sync, or reminder-aging scripts in production.

Review GitHub Desktop filenames with user, then let user commit/push. Suggested
summary: “Add assigned event invitations and Community navigation”. Wait for Vercel
Ready, then short live smoke check: existing contacts/history; Invitations; one
authorized assignment and save when practical. Avoid another full manual marathon.

## Maintenance and rollback

Normal contact query unchanged. Refresh both invitation query copies when normal
Follow Up filtering changes. Refresh private.community_log_interaction if the
installed normal interaction implementation changes. Original function stays void.
Recipient lookup limits dropdown choices; it does not narrow the existing database
assignment permissions. Existing assignees outside choices remain visible.

Rollback UI to the verified preceding deployment if needed. Leave Community and
invitation data/merge hooks intact; do not drop attendance or outreach records.
Fireworks celebrations remain deferred and are not part of this release.
