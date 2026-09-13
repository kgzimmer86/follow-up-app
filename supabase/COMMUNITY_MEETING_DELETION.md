# Community meeting deletion

Prepared locally; the deletion migration and application change have not yet been released.

History now offers Delete meeting to everyone who can edit attendance in that group:
designated leaders within their current area scope and staff/admins within their oversight.
Confirmation names the date and explains that its attendance is permanently deleted.
The roster, shared contact statuses, and all other meetings are preserved. Archives stay read-only.

## Release order

1. Obtain explicit production SQL approval from the product owner.
2. The owner runs all of `migrations/20260913_community_delete_meeting.sql` in production Supabase.
3. Confirm success before the owner commits and pushes the matching code through GitHub Desktop.
4. After Vercel is Ready, open the accidental meeting in History, test Cancel first,
   then confirm deletion of that specific accidental meeting. Verify the real meeting and roster remain.

The SQL adds one authenticated RPC and changes nothing until someone invokes it.
It uses the existing group access/archive guard and group lock, verifies meeting identity,
meeting version and group revision, and advances the group revision on deletion so an
older open checklist cannot recreate the deleted meeting. Existing attendance cascades
remove only the deleted meeting's entries.

## Verification

- Production build and TypeScript passed for the application change.
- `node --test supabase/tests/community.test.mjs` passed: one integration test with
  assertions for designated leader deletion, revoked/inactive/out-of-scope denial,
  anonymous and direct-delete denial, wrong-group meeting identity, stale versions,
  archived campaign/inactive group denial, attendance cascade, preserved roster/contact
  records/other meeting attendance, repeated deletion, and stale-save rejection.
- Tests use invented records in local PGlite. PGlite is now a repository development
  dependency; the old temporary library was unavailable. No production connection was used.
- Browser confirmation/cancellation and the hosted RPC remain unverified until release.
- Lint was not rerun for this change. Prior execution attempts were blocked by permissions.

This is an intentional permanent correction operation, not a soft-delete or undo feature.
No database restore has been tested. For an application rollback, retain Community tables,
the merge hook, and this RPC; roll back the app rather than dropping database objects.
