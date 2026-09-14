# Invitation assignments — local implementation checkpoint

September 14, 2026. **Locally verified; test preview source updated. Do not commit/push or run in production.**

Product decisions are in `INVITATION_ASSIGNMENTS_SPEC.md`.

Local implementation includes:

- Migration `20260915_invitation_assignments.sql`: event-specific responsibility,
  role-checked bulk assignment with versions, shared outreach ledger, atomic logging
  through existing text/interaction routines, reminder counts, paginated workspace,
  and extended duplicate-merge preservation.
- My Invites and assignment routes under `/community/invites`, linked from Events.
- An asynchronous client badge provider. Server layout does not await counts.
  Counts refresh at most every minute while visible, on returning to the app with a
  30-second throttle, and after invitation mutations with deduplication.
- Campaign-event selection in confirmed text and interaction forms. My Invites
  preselects its event. Existing freeform event text logging remains available.
- Red initial-invitation badge in Events and the workspace selector. Amber stale
  response cue in My Invites. Existing Follow Up owner remains separate.

## Verification

New `supabase/tests/invitation-assignments.test.mjs` covers role boundaries, stale
assignments, bulk rollback, retry identity, preserved responses, atomic log failures,
expiry, merge retention, and badge index selection with 10,001 invented invitations.
All five tests passed. Interaction calls use a reconstructed spy; the text logging
routine is extracted from the existing migration. This is not a full production
restore, security audit, or concurrent multi-session race test.

Across the verification runs, all 121 selected helper/database tests passed.
The first runs exposed two fixture issues: an unqualified test-helper table name,
and comparison of Date objects by identity. Both are corrected; the entire new
five-test suite then passed. Existing community regression and text tests passed.
Production build and TypeScript passed. Lint: zero errors, one existing image
warning in app-loading.tsx. The new badge query used its assignee index with
10,001 invented invitations. No hosted badge latency measurement or new manual
pass has occurred. Full exported-schema contact-query parity was not rerun.

## Current permissions and preview

- One-time Node verification access to `/System/Library/OpenSSL/openssl.cnf` approved.
- Access to `/private/tmp/follow-up-staging-app.7gxSub` for this round approved.
- Source synced by explicit file list; layout patched to retain the yellow banner.
  Test `.env.local` was not read or modified. Previous server was stopped and
  the test server restarted successfully on port 3001 (session 14854).
- No production migration, commit, push, deployment, backup, browser, or other-app
  access is authorized. User handles GitHub Desktop release.

Next: give the user the migration for the **test** Supabase project only, one step at a
time. Verify with invented contacts: assign outside roster, claim collision/stale
save, cancel review, confirmed text, interaction reminder, shared response and
badge clearing. Measure actual test behavior before claiming launch impact.

## Recovery

### Test-session progress

Latest navigation revision (local + test preview, no SQL needed): Community now
has Groups / Events / Invitations; red initial-invite count moved to Invitations.
Invitations defaults to My Invitations, with role-specific Assign Invitations
(staff/admin/discipler) or Claim Invitations (student leader) pill tabs. Events
shows the group-event response view, sole-group automatic selection or group
selector, and staff/admin Create / Manage Events tab. No-group users retain full
invitation access. Group tabs now Attendance, People, Needs Attention, History;
staff/admin Group settings retained as a separate header link. Legacy group
Events URLs redirect to the new page retaining campaign/group/event. Contact
Back links retain new Events context. Event view skips attendance-history queries.
Pill tabs reuse shared navigation pending feedback. Build and TypeScript passed;
this navigation revision has not yet been manually/browser checked.

Demo contact seed initially failed in hosted testing because Markley was absent.
User requested the real production ministry-area catalog instead of placeholders.
Saved their supplied 35-area configuration in tests/fixtures/ministry-areas-reference.json.
Prepared tests/sync-real-ministry-areas.sql, guarded by the known test campaign
and four confirmed existing test area IDs. It preserves IDs while mapping
test-north → north-campus, test-central → central-campus, test-central-dorm →
west-quad, and retaining bursley. Adds remaining catalog entries with correct
hierarchy; no contact/user records or assignments are rewritten. User installation
is still pending. Then rerun the original 12-contact seed, unchanged.

New local area-update and seed tests: 2 passed using reconstructed schema and
invented records. Confirmed catalog parity, preserved contact references, safe
rerun retaining all area IDs, wrong-environment rejection, and successful demo
seeding after the area update. Hosted installation still needs user confirmation.

Assign invitations now has an expandable Follow Up-style filter menu: campus,
dorm, floor/wing, gender, status, Jesus/Community/Interview answer combinations,
KGP/interview/CG progress, affinity, room presence, and current Community roster.
My Invites retains its simpler filters. Assignment filter choices do not write
Follow Up's personal filter cookies. Changing the expandable filters clears the
selection so hidden contacts are not unintentionally carried into bulk review.

Additional test migration **pending user installation**:
`20260915_invitation_contact_filters.sql`. Run after invitation assignments.
It clones the installed contact-results query into a separate guarded endpoint;
event/group/search predicates run before pagination. Normal Follow Up RPC stays
unchanged. Refresh this clone and parity tests when the original query changes.
Invitation metadata is loaded only for the returned page (at most 50 students).

Filter-change verification: production build and TypeScript passed; lint zero
errors and the existing image warning. New PGlite integration test passed using
the actual local contact-query SQL and reconstructed core schema: ten filter
parity combinations, current/former roster, combined filters, late-page matches,
search, stale access/inactive users, archive and anonymous denial, and safe rerun.
This does not replace testing against the installed test database. Three changed
components synced into the approved preview folder; no configuration touched.

User reported successful test migration installation, assignment to a student
leader, red Events badge, confirmed text completing the task and clearing the
badge without refresh, correct contact history event/date/time/recorder, and a
repeat text retaining Coming without reviving the badge. These are user-reported
manual passes, not browser automation.

Requested visual adjustments: My Invites text-attempt button matches the white
Follow Up Text style. Both invitation screens stack Event, Ministry area, Search
students. My Invites defaults to All events and now supports event filtering via
the existing RPC. Synced these two source changes to the approved test copy.

The user ran the new migration successfully in testing; no production migration
has been run by this task. If a future test migration fails, its
transaction should roll back; inspect the error before retrying. Do not drop
Community tables. Do not push application changes before the corresponding
production migration is separately reviewed and explicitly approved.

## Desktop assignment table and recipient choices — September 14 follow-up

Staff/admin Assign Invitations now uses a table at lg/1024px and above, with
student, dorm/room, response and Assigned to dropdowns. Row dropdowns open the
existing confirmation and stale-version assignment flow; bulk selection remains.
Mobile cards remain. Table client file is synced to the approved test copy.

New `20260916_invitation_recipient_choices.sql` adds a read-only recipient lookup:
self, the entire current campaign discipleship chain below the viewer, plus users
whose default area is within the viewer's default area and descendants. No default
continues to mean All Campus. Existing role restrictions remain. This changes
dropdown visibility, not assignment SQL permissions. Current assignees outside
the choices remain visible as disabled options. No production changes executed.

Migration NOT yet run in test. Main invitation-workspace-page.tsx uses the new
lookup and wider staff table layout, but that server file is intentionally NOT
synced to test until the user reports migration success. Next: have user run the
migration in TEST Supabase, then sync that server file and manually view the table.
Build/TypeScript passed. New local PGlite recipient test passed, covering deep
descendants/cycles, area descendants, non-default exclusions, inactive/pending,
role restrictions, archived campaign and anonymous denial. No browser verification.

User subsequently reported successful test migration. Synced
invitation-workspace-page.tsx to the approved test copy and verified it matches.
Recipient lookup and wider desktop table are now activated in the test preview;
manual browser verification is pending. Production remains unchanged.

## Assignable-only cards — pending test migration

User verified row assignment, bulk assignment plus recipient delivery, reassignment,
and leader self-claim. Cross-account badge took roughly 30 seconds. User also
confirmed that keeping rows mounted during post-save refresh removed scroll jumping.
Spreadsheet assignments now save without confirmation; bulk still confirms.
Groups column and colored response pills are present. Assigned Not asked rows red.

Latest request: hide unassignable contacts in phone assignment and claim views;
keep them darker gray in staff/admin desktop spreadsheet. Implemented in main
invitation-workspace.tsx with responsive query mode. New migration
20260916_invitation_assignable_results.sql adds a separate cloned query with
assignability filtering BEFORE pagination. Existing queries remain unchanged.
Requires refreshing clone if original filters change. Local test on 1,000 invented
contacts passed (full spreadsheet count, staff reassignable rows, leader exclusions,
full pages and closed events). Build and TypeScript passed.

NOT yet run in test; latest invitation-workspace.tsx is NOT yet synced to preview.
Next: user runs migration in TEST, then sync this client file. No production action.

User reported test migration success. Synced invitation-workspace.tsx to the
approved test preview and verified identical contents. Assignable-only cards and
gray unavailable spreadsheet rows are active in testing; manual check pending.

## Event interaction return mismatch — test fix ready

User passed unavailable-row presentation, bulk cancel, 72-hour no-response cue,
reminder reset via text, and event closure clearing cues. Recipient area/chain
boundaries remain browser-unverified (two test accounts; viewer All Campus).
Event interaction Coming test failed: invalid input syntax for uuid empty string.
User supplied installed log_interaction definition: RETURNS void. Earlier local
tests used a UUID-returning spy, missing this mismatch.

20260916_invitation_interaction_return.sql creates a private ID-returning copy
of the installed interaction function with strict shape checks, and redirects
the invitation wrapper to it. Original function remains unchanged. Refresh this
private copy if normal interaction logic changes later. Attachment path unchanged.
New regression uses supplied actual function (normalized fixture) and reproduces
the exact error before migration, verifies failure rollback, successful history
link/Coming/received-Christ implies KGP, retry deduplication, and atomic rollback
including ownership if invitation validation fails. Local targeted test passed.
Migration NOT yet run on test or production; user next runs it in TEST Supabase.

User subsequently reported test migration success and manually confirmed the
interaction saved with event history and Coming response, with no action cue.
Final automated closeout: 94 helper tests + 19 database tests passed, build and
TypeScript passed, lint zero errors / existing image warning. See
INVITATIONS_RELEASE.md for ordered five-migration release plan and remaining
coverage limitations. Production preflight prepared but not run; GitHub Desktop
changed-file list still needs user review before commit/push. No production writes.

## Production database ready; application release pending

User reported all seven production preflight checks PASS and explicitly approved
each of the five migrations in INVITATIONS_RELEASE.md. User ran each and reported
success. Confirmed preceding deployment: follow-up-ahxjgf07a-michigan-cru.vercel.app.
User supplied screenshots of the 43 changed filenames; reviewed as release-related
source, migrations, docs and test fixtures. All may stay selected. No secrets or
backups appear in the supplied filename list; no full Git diff audit claimed.
User next commits/pushes, then reports Vercel Ready for short live smoke check.
