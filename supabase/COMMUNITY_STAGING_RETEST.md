# Community staging checks, September 12, 2026

Latest closeout: see COMMUNITY_V1_CHECKPOINT.md for the current 98-test result, source-review notes, and remaining targeted checks. Historical pending items below may be superseded by later entries; the checkpoint is the current release checklist.

Production has not been migrated or deployed. Staging project: `tcbwepqkvnquxkbtaxcl`. Local isolated app: `/private/tmp/follow-up-staging-app.7gxSub`, port 3001. Preserve its separate environment file and TEST ENVIRONMENT banner. The user restored TEST ONLY — 2026-2027 to active using guarded testing-only SQL after completing archive checks.

## User-confirmed manual passes before this update

- Group creation; adding existing/new invented people; present/absent saves survive refresh.
- Shared Involved status; final-membership review/cancel/removal; restoration; multiple memberships including groups hidden from the acting leader.
- Stale two-tab save rejected and newer attendance preserved; unsaved navigation cancel/discard.
- Admin/staff area scope, changes of default area, leader/discipler designation, direct-link denial, inactive/reactivated accounts, revocation of group leadership.
- Student leader adding existing members and saving attendance.
- Actual importer weak-match merge: one student, one campaign contact, Involved and group/attendance history preserved.
- Historical roster before join date is empty.
- Direct archived group pages preserve attendance and hide writes for admin and student leader.

The second account leads TEST North Tuesday (not Thursday).

## September 12 local fixes requiring browser retest

- Community falls back to the latest archived campaign when none is active, retaining its year selector.
- Manage, My Contacts and My Disciples render an intentional no-active-campaign state for known database messages. Other errors still surface normally. Campaign management remains linked and enforces its existing admin authorization.
- Out-of-range/future/malformed URL dates do not render an attendance checklist; show the warning instead.
- Group not-found boundary explains unavailable/restricted access without disclosing group existence.
- Attendance save errors say Save failed and use the existing amber warning colors and rounded pill styling.
- Superseded: the original Check again notice explained blanket confirmation resets. The later importer fix below preserves unchanged decisions instead.

## Subsequent user-confirmed passes

- No-active-campaign screens, including Leaders and Assign, now load with Home-style presentation.
- Friendly restricted-group message and existing gray Back button.
- Phone-width Community layout: no reported clipping or cramped controls.
- Group stat boxes and full-card navigation approved visually.
- Active group's Ever attended shortcut opens real Follow Up cards; contact detail Back returns to the group-filtered list.
- Test interaction saved through the shortcut and persisted after refresh; second account can see it through its own assigned Tuesday group.
- Second account denied Thursday's direct contact-list URL, with no cards disclosed.

## Automated review after contact shortcut checks

- Added five contact-scope tests: four segment definitions, all-page intersection with authorized results, deduplication, empty scopes, campaign/error failures, and stopping when all requested contacts are found.
- Original contact RPC, RLS, importer scoring, and SQL migration unchanged in this review.
- Full app helper suite: 80 tests; database integration/compatibility suite: 6 tests. Build and TypeScript pass. Lint has only the pre-existing app-loading image warning.
- SQL integration fixtures use some reconstructed tables/helpers; this is not an exhaustive production security audit.

## Latest manual and scale-test results

- User screenshot confirms invalid-date amber warning, without attendance checklist/save button.
- User confirms amber Save failed on stale two-tab save; refreshed second tab shows the newer saved absence unchanged.
- Current-roster cards/spreadsheet and sort navigation preserve Alex and the group context. Ever attended correctly excludes Alex after his sole recorded presence was changed to absent.
- Five synthetic scale tests pass for correctness, including 125 matched contacts spread over three displayed pages, absent/unauthorized matches, and early termination.
- **Release blocker: contact shortcut query count.** With 50-row RPC pages, late matches require 20 sequential requests for 1,000 authorized contacts, 100 for 5,000, and 200 for 10,000. An unavailable/filtered-out requested contact forces a full scan. Local computation is fast; network/database latency was not measured. At an illustrative 100 ms per request, 100 requests implies approximately 10 seconds before other page work.
- Next implementation: database-side group scope before pagination, preserving existing contact authorization and normal Follow Up query behavior. Requires reviewed SQL and testing-only installation; do not deploy the current all-pages intersection as the finished solution.

Remaining verification: importer confirmation-reset notice; database-side shortcut optimization and realistic-volume verification; final release sign-off. Do not repeat completed manual checks unless their code paths change.

## Database-side shortcut optimization prepared

- Added `20260912_community_contact_results.sql`: separate RPC, group access and active-campaign checks, then membership/attendance predicates before original filtering, counting and pagination. Existing contact function remains byte-for-byte unchanged in tests; original authorization/filter clauses are retained.
- Removed all-page scanning and full group-history loading from the production application shortcut path. The old synthetic scope tests remain as baseline evidence of the superseded approach, not measurements of the new path.
- New SQL test uses the full local application structure export and 10,000 invented contacts, with simulated Supabase auth/storage infrastructure only. Verifies 125 matching members across 50/50/25-row pages, counts, gender/status filtering, sorting, exact card-field parity, former-member history, correct leader access, denied unassigned/inactive/anonymous access, archived rejection, and repeat installation.
- Representative isolated timing: one scoped SQL call approximately 14 ms, versus the old 200-request worst case. This is local PGlite timing, NOT hosted Supabase or browser timing.
- Testing installer: `bash supabase/tests/install-contact-shortcuts-testing.sh`. Fixed project target `tcbwepqkvnquxkbtaxcl`; privately prompts for test password; syncs only the two dependent app files after successful migration. No credentials stored. Testing app deliberately remains on its working prior version until installation.
- Hosted testing installation and smoke check still pending; production untouched.

## Latest hosted and importer follow-up

- User ran the testing-only optimized-query installer successfully and confirmed Thursday roster contact cards still load correctly afterward.
- Importer Check again blanket reset removed in main source and testing copy. Weak-match confirmations now bind to campaign, row matching fields, candidate identities/details and conflict flags. Candidate order alone does not invalidate approval. Changed/new evidence reopens only affected confirmations with row-number notice.
- Name, dorm and room changes now require fresh matching like phone/uniqname changes; reset-row also marks matching stale. In-flight results are ignored after row edits, campaign/file/mapping reset, or a newer check. Import remains blocked until a successful current check.
- Four new confirmation tests pass, full app helper suite 89 passes, build/TypeScript pass, lint has only existing image warning. Existing exported importer/merge regression suite rerun. No scoring, survey precedence, database matching functions, or import merge SQL changed.
- Browser retest: confirm a weak Merge or Keep separate decision, click Check again unchanged, expect retained confirmation. Alter one matching field and recheck, expect that row to require review; other confirmed rows should stay confirmed.

## Workspace switcher — awaiting visual/navigation review

- Replaces branded top-left link with compact Follow Up/Community disclosure on desktop and phone. Yellow icon box and navy/white/maize styling; outside pointer, Escape and focus departure dismiss it.
- Follow Up nav retains previous role-dependent items minus Community. Community desktop nav shows Groups; mobile uses in-page tabs without bottom nav. Attendance sticky save panel moves down accordingly.
- Group-scoped contact lists and contact details with a Community `from` URL retain Community context. Ordinary contact/Manage/disciples URLs remain Follow Up. No persistent workspace setting or permission changes.
- Main source and testing copy updated, no SQL required. Build/TypeScript and 91 app tests pass; existing image lint warning only.
- Focused browser check still needed: switching both directions on phone/desktop; dropdown dismissal/keyboard; contact detail return path; dirty attendance navigation cancellation; role-specific Follow Up nav availability. Existing data/merge tests need not be repeated manually for this shell-only change.

Run the new test with `FOLLOW_UP_EXPORTED_SCHEMA=/private/tmp/follow-up-staging-schema.sql FOLLOW_UP_PGLITE_MODULE=/private/tmp/follow-up-text-validation/node_modules/@electric-sql/pglite/dist/index.js node --test supabase/tests/community-contact-results.test.mjs`. Export contains application structure only; fixtures generated by the test are invented.
