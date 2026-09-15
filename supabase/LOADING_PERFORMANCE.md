# Loading improvements

Prepared locally; not installed in Supabase or deployed. No changes to screens,
styles, filters, status/assignment writes, membership/attendance writes, or photos.

## Application changes

- Contact details load independent student/area/affinity/history/roommate data
  together, after verifying the contact. They still fetch the same fields and use
  the same signed-in client and error checks.
- Contact lists reuse the layout's request-scoped verified account check. No
  cross-request or cross-user data cache is introduced. Persistent temporary
  failures use the existing recovery component; access restrictions remain.
- Contact-list assignment data, CG text-only preferences, roommate labels, and
  optional spreadsheet history load together after filters/pagination settle.
- The layout fetches the default assignment and its area name together, saving
  one startup query. The existing foreign key supplies the nested area.
- Group data loads independent branches together with the existing pagination.
  Attendance checklists read only the selected meeting's attendance; Settings
  skips member/contact/attendance reads, History skips member/contact reads.
  Full People charts and Needs Attention details still load their full history.
  Archived date fallback, versions, group revision, and all save controls remain.
- A contact's Community tab filters memberships and attendance to that student;
  it skips unrelated contacts and group attention calculations. All of that
  student's membership periods, including rejoining, and history remain visible.
- Badge refresh schedules and celebrations are unchanged.

## Additive SQL

`migrations/20260918_loading_performance.sql` is the complete SQL file.

- `get_contact_assignment_page(uuid[])` copies the INSTALLED workspace reader
  into a separate function and adds only a requested-contact-ID restriction,
  bounded to 50 IDs. The original function is untouched. Guards require exactly
  one occurrence of each insertion point and fail the transaction otherwise.
  Assignee choices, area/affinity/discipleship scope and role checks are retained.
- `get_community_group_summaries(uuid[])` returns the existing four counts and
  latest date for up to 100 visible groups. It uses SECURITY INVOKER, preserving
  the table RLS of the old queries, and calls the existing check-in attention RPC.
  Ever attended includes former members and counts each person once. Involved
  counts only current members with that shared campaign status. Archives and
  inactive groups keep their existing display behavior.
- No schema, table-data, RLS-policy, or write-function changes. No indexes added
  without a production query plan. New functions deny anonymous execution.
- The app falls back to the original readers ONLY when PostgREST reports a
  missing RPC. Permission/network errors remain errors. Until SQL installation,
  those fallback routes incur one extra missing-function request.

## Installation and rollback

1. Run `ready-to-run/loading-performance-preflight.sql` in the intended Supabase
   project. All values in its FIRST TWO results must be true. The third result
   only reports whether these new readers already exist. Stop on a false value;
   do not rerun old Community migrations based on file presence.
2. Run the COMPLETE `migrations/20260918_loading_performance.sql` in one execution.
   It is transactional and rerunnable. The user runs SQL manually; this file has
   not been executed against a hosted project by the coding agent.
3. Commit/push through GitHub Desktop and let Vercel deploy. Keep the current
   preceding deployment available for rollback. Old UI can coexist with these
   new readers, and new UI can fall back if they have not yet been installed.
4. If any assignment rules in `get_contact_assignment_workspace()` change later,
   rerun this migration and the parity tests so the new reader follows them.

## Verification

- New helper tests compare selected-meeting checkboxes and personal attendance
  summaries against complete-history results, including rejoining and unsaved
  dates. They verify history beyond a response page, parallel reads, errors,
  bounded summary batches, and missing-SQL fallback behavior.
- Database parity tests compare the new assignment reader to the original for
  staff/admin/discipler, area/affinity/owner restrictions, empty/multiple pages,
  inactive/pending/anonymous users, and installation guards. Group-summary tests
  use authenticated RLS and verify former/rejoined members, empty groups, more
  than 1,000 attendance records, check-in clearing, deletion and archives.
- The synthetic personal-history fixture returns 17 attendance records instead
  of 2,143, with identical personal history. This measures payload reduction,
  NOT real phone loading time. No hosted speed percentage is claimed.
- Standard `npm run build` (Turbopack) and TypeScript passed in this session;
  the historical local Turbopack restriction did not occur. Lint: zero errors,
  the existing startup-image warning only.
- Final regression checks: 134 tests passed across the completed runs. The
  structure-export test initially lacked its environment variable; it passed
  when rerun with the documented `/private/tmp/follow-up-staging-schema.sql`
  structure-only fixture. No live database or real student records were used.

Short phone smoke check after deployment:

1. Fresh launch: correct default area; open a smart card and switch card/sheet.
   Filters, paging, roommate links and Back to results should stay the same.
2. Open a contact: compare Survey, history, assignment choices and Community.
   Check CG text-only still disables only the intended Knock action.
3. Open a group: compare all four summaries, saved attendance date and checkboxes,
   People list/chart, Needs Attention, History and Settings. Check an archived
   group and a former/rejoined attender where available.
4. Make one normal attendance/interaction save in the test environment and
   confirm it persists and updates the appropriate attention counts.

Authenticated browser/phone smoke checks and hosted latency measurements remain
manual; local build and synthetic tests do not substitute for them.
