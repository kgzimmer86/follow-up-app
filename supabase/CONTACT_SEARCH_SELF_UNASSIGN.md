# Contact name search and self-unassign

1. Save the current deployment/commit as a restore point.
2. Run the complete `ready-to-run/contact-search-self-unassign-preflight.sql`.
   All prerequisite/shape columns should be true. The two `already_installed`
   columns should be false on the first installation.
3. Run the complete `migrations/20260921_contact_name_search_and_self_unassign.sql`.
4. Run the complete `migrations/20260922_not_interested_my_contacts.sql`.
5. Commit/push the app changes and wait for Vercel Ready.

Marking a contact Not Interested automatically excludes them from My Contacts,
all three personal attention lists/counts, and the personal-contact part of the
push snapshot. Their ownership and history remain intact. They remain searchable
in View All Contacts when its other filters permit, and changing their status
back restores them to My Contacts (attention is recalculated normally).
Invitation/group rules are unchanged. Background badges follow the existing
push schedule; no additional push or notification is sent by this migration.

Home → View all contacts in your area now has a name field, Search button,
and Clear button. Matching is case-insensitive literal substring search across
all pages, within the existing area and other filters. Search resets pagination
to page one and stays in the URL for sorting, display switches, filters, and
return links. It is not saved as a personal filter or carried into other lists.
Only a results page of contacts is rendered, not the full dataset.

Open one of your contacts → Primary → Unassign from me → confirm. Any active,
non-pending user may release their own contact in an active campaign, including
cross-area assignments and contacts marked Not Interested. No user may use this
function to release another person's contact. A stale page after reassignment
fails safely. Status, contact/student records, history, invitations, and group
membership are not modified; existing assignment-metadata triggers still run.
Existing manager/disciple unassignment is unchanged.

The first migration adds separate readers/actions. The second updates only the
My Contacts selection rule in the base/search readers and the shared attention
helper, preserving function signatures and privileges.
Rolling back the app commit is safe, but retains the Not Interested rule.
Rolling back code does not reverse deliberate assignments already released.
After future changes to the base contact-results RPC, rerun this migration and
the parity tests to refresh its separate search reader.

Acceptance: find a contact originally beyond page one, search mixed-case and
partial names, clear search, combine with existing filters, change pages/sort/
card-sheet display, and return from a contact. Mark a safe test contact Not
Interested; confirm it leaves My Contacts/attention but remains searchable in
the area list with status filters cleared. Restore its status as needed.
Unassign only a safe test contact:
cancel first, then confirm; check it leaves My Contacts while history/status
remain intact and the personal badge refreshes. Reassign normally if needed.

Local validation: production build passed; 214 self-contained tests passed,
including literal name search across pages, filter parity, blank/no matches,
confirmation/cancel/error handling, owner-only release for each approved role,
stale ownership, inactive/pending/signed-out access, closed campaigns, preserved
status/history, assignment metadata cleanup, and Not Interested removal and
restoration. The separate community-contact-results test requiring a complete
exported schema was not run. No production records or notifications were used.
