# Community v2: Needs Attention and campaign event invitations

Release candidate: both v2 migrations were installed successfully by the owner in
testing project `tcbwepqkvnquxkbtaxcl`. The owner completed the focused hosted checks
below, then explicitly approved and ran each migration in production
`ghsoqsuotjhfetbkbsdr`, reporting success for attendance filters followed by events.
The production database is ready; owner Commit + Push and the v2 deployment are pending.
No production SQL, commit, push or deployment has been performed by the agent.
The product owner handles releases. Final automated closeout passed: build/TypeScript,
102 tests, and lint with zero errors and the one existing image warning.

## Product decisions

- Needs Attention replaces On roster on each active group card. It opens the group's
  Needs Attention list. On roster contacts remain reachable at their existing URL.
- A current member is listed after two consecutive saved meetings with explicit absent
  records, since the start of their current membership period. Unknown attendance is
  not absence. Returning after an ended membership starts a new eligibility window;
  same-day undo of removal retains the original period. Deleted meetings do not count.
- Context shows attendance among the last five eligible meetings (or fewer), last
  attendance date, and any missing records. No status is changed automatically.
- Ever attended uses a neutral gray card; Needs Attention uses amber. Ever attended
  still counts all unique students ever present. Its contact interface has All (default),
  Attending and No longer attending pills directly above the contacts, partitioned by active membership.
  Absence alone does not change roster membership. Database filtering happens before
  pagination and retains existing Follow Up authorization and filters.
- Community contact lists do not automatically restore Follow Up's personal/default
  campus filter, activate its filter session, or overwrite saved Follow Up preferences.
  Explicit filters chosen on the Community contact list still apply.
- Community has Groups and Events in mobile bottom navigation and desktop navigation.
  Attendance Save is positioned above the mobile bar. For student leaders/discipler
  accounts, Events opens the current group's Events tab, redirects to their sole
  accessible group, or shows an authorized group chooser. Staff/admins manage events.
- Events belong to exactly one campaign. Staff/admins create/edit the name, date,
  optional location/details, and whether invitation updates are open. No group-only events.
- Designated leaders within current area scope and staff/admins within oversight update
  responses through their group roster: Not asked, Invited, Maybe, Coming, Can't come.
- One response per event/student is shared across groups. Missing response means Not
  asked. Updates have optimistic versions. Membership, role and area are checked at save.
- Closing an event keeps responses. Archived campaigns/groups are read-only. Archived
  group cards do not expose actionable contact links. Needs Attention is active-only.
- Duplicate merges preserve invitation responses. If both identities have a response,
  the most recently edited response wins; exact timestamp ties retain the kept identity's
  response. The response version advances to reject old views. Shared Follow Up status
  and importer survey precedence/scoring remain unchanged.

## New migrations (review first; testing before production)

1. `migrations/20260914_community_attendance_filters.sql` extends the installed scoped
   Community RPC with shape guards. The normal Follow Up RPC is unchanged. Re-running
   after installation is a no-op. If the original scoped RPC is refreshed using
   `20260912_community_contact_results.sql`, reapply this extension afterward and retest.
2. `migrations/20260914_community_events.sql` adds event/invitation tables, RLS, write
   functions and an additional merge trigger. It stops if event tables already exist;
   inspect rather than deleting or retrying blindly.

The base Community and scoped-contact migrations must already be installed. Meeting
deletion is independently installed; this change does not modify that RPC.

Use testing project `tcbwepqkvnquxkbtaxcl` with invented records first. Access to the old
temporary test app or schema export is not authorized by this document; ask separately.
Never overwrite its environment file or yellow testing banner. Do not point a preview
at production to exercise unreleased SQL. Production project is `ghsoqsuotjhfetbkbsdr`;
each production migration requires explicit approval and reported success before the
owner commits/pushes matching app code through GitHub Desktop.

## Automated verification

- Production build and TypeScript passed for the new UI.
- Lint: zero errors; one pre-existing app-loading image warning.
- 102 tests passed: 94 app helper tests and 8 local database integration tests.

```sh
node --test src/lib/*.test.mjs supabase/tests/community-v2.test.mjs supabase/tests/community.test.mjs supabase/tests/community-regression.test.mjs
npm run lint
npm run build -- --webpack
```

The event tests cover create permissions/date validation, shared multi-group replies,
RLS/direct-write/anonymous denial, area and leader revocation, inactive accounts,
stale replies/event edits, closed events, archives, cross-campaign rejection, merge
conflicts and campaign cascade deletion. Real exported importer/merge-function tests
also verify invitation preservation alongside existing Community relationships.

Fixtures contain invented data and some reconstructed infrastructure/helpers. These
tests do not prove every production policy or genuinely concurrent connection behavior.
The new split-query test uses a deliberately minimal source RPC. The existing full
exported-schema scale/parity test was extended but NOT rerun: its external structure
export has not been accessed. Browser evidence below is owner-reported manual testing,
not agent browser automation. Git status/diff checks remain unavailable because the
system Git launcher reports missing command-line developer tools. No other Git
installation or configuration was accessed during closeout.

## Owner-confirmed hosted testing

1. Needs Attention added TEST Daniel after absences on September 11 and 13. Changing
   September 13 to present removed him and decreased the group-card count.
2. A restored test member appeared on today's roster; earlier dates correctly excluded
   the new membership period. A separate invented member was added with a September 10
   start for the two-absence check. Earlier failure to see a member was date eligibility,
   not an established restoration defect.
3. Ever attended's All / Attending / No longer attending arrangement was approved.
   The initially inherited campus filter was fixed, and pills were moved over results.
4. Admin created TEST Fall Dinner; a response saved and survived refresh. A leader
   also changed and saved a response. A student in two groups shared one response.
5. Two-tab stale invitation save was rejected and the newer response retained. The
   owner approved moving “Response not saved” inside the amber warning.
6. Admin closed invitation updates; leader refresh showed read-only responses. Existing
   pages require refresh; there is no realtime subscription. SQL rejects saves after
   closure even if a stale page still shows controls (automated test, not a separate
   manual stale-page-after-closure attempt).
7. A designated leader's direct link to an unassigned group was denied.
8. Owner approved card colors, Needs Attention card spacing, bottom Groups/Events
   navigation and leader-specific Events navigation. Create event was absent under the
   leader account and present under admin, as intended.

Remaining evidence limits: v2 archives, full query scale/parity, and all viewport /
keyboard combinations were not manually repeated. Archives are covered by isolated
SQL tests and prior v1 manual evidence. No production tests of v2 have happened. Do not
repeat completed manual workflows unless relevant code changes require it.

## Production release gates

1. Owner identified `follow-up-ro069ygyf-michigan-cru.vercel.app` as the current
   production v1 rollback deployment. The
   older pre-Community deployment `follow-up-phv6z2pkz-michigan-cru.vercel.app` / `823444b`
   is historical; do not mistake it for the latest v1 deployment.
2. Owner explicitly chose to use the existing database/photo backups without a fresh
   backup: the attendance entered since the earlier dump was for testing and can be
   re-entered by the actual leaders. No backup folders were accessed for this decision.
   Readability and file-size checks are not a tested restoration.
3. Obtain explicit approval for each production migration, run attendance filters first
   and events second, and confirm success before the owner commits/pushes.
4. After Vercel is Ready, briefly check existing Follow Up contacts, Community cards,
   and event creation/response visibility. Use a real event only when the owner is ready;
   do not create invented records in production merely to repeat staging tests.

Both production migrations were explicitly approved and reported successful. The next
release step is the owner's deliberate GitHub Desktop Commit + Push. For application rollback leave Community tables
and both merge triggers intact; dropping event tables would lose responses. Existing
database/photo backups were checked but a full restore remains untested.
