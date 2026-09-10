# My Contacts attention and Staff handoffs

Run the complete `migrations/20260910_staff_handoffs_and_assignment_attention.sql` in Supabase SQL Editor, then deploy the app changes. Committing SQL to GitHub does not execute it. This supersedes the original `20260909_my_contact_attention.sql`; do not rerun the older file afterward.

The new migration adds nullable `primary_assigned_at` and a trigger that records future ownership changes (including self-claims and assignment at contact creation). Existing assignments stay NULL because their assignment dates are unknown. Changing unrelated contact fields or assigning the same owner again does not reset the timestamp. Unassigning clears it. Existing status/coaching-exemption triggers remain intact. No existing contact ownership, status, history, role, or discipleship relationship is rewritten.

Counts cover the signed-in user's primary contacts in active campaigns, independent of personal filters and default area:

- Assigned — awaiting your interaction: no interaction **performed by the current owner** on or after the assignment timestamp. Prior interactions, other people's interactions, knocks and text attempts do not resolve it. For legacy NULL timestamps, any interaction by the current owner resolves it. Deleting the qualifying interaction restores the reminder.
- Stale Go Back: status Go Back and latest logged activity at least seven days ago (unchanged).
- New believer: received Christ at least 24 hours ago, with no interaction strictly later than that timestamp (unchanged). The original conversion interaction is not a follow-up. Text attempts and knocks do not clear this category.
- Total: each contact matching one or more categories counted once. Existing status and coaching-exemption treatment is unchanged for these personal reminders.

The My Contacts section and desktop/mobile badges share one count response. Each attention box opens `/contacts/attention` with its matching contacts, 50 per page, ignoring saved filters without changing them. Contacts link to detail with a return destination pointing back to the same attention category/page. Both counts and lists use the same private SQL predicate; no RPC accepts someone else's user ID.

Counts load independently of startup, refresh after route/server refresh, foregrounding, or every minute while visible. Failed reads show a retry and suppress the badge rather than report a false zero. There are no push notifications.

## Staff assignment and coaching boundaries

- Active Staff/Admin can hand an eligible active-campaign contact to another active Staff/Admin across ministry areas. Not Interested contacts remain excluded. Ordinary Discipler, student-recipient, and self-assignment rules remain unchanged.
- Contact Overview → Primary groups eligible direct disciples separately from Staff/Admin recipients. Self-assignment still uses the existing claim function. The general Assign Contacts workspace gains Staff/Admin recipients but keeps its original contact-area scope. The coaching-page assignment picker still selects unassigned contacts in the recipient's default area within that workspace; cross-area handoffs are available from Contact Overview.
- A handoff changes ownership, not status or history. The sender's Go Back smart list already uses their personal interaction history rather than current ownership; its criteria and saved filters remain unchanged.
- Admin → Users already permits giving Staff/Admin a discipler. Their direct discipler can now open their coaching page. Staff/Admin roots show only their own activity/contact metrics, with no descendant list or counts. Student Leader/Discipler branch totals retain existing behavior. This does not grant unrelated staff access to another staff member's coaching page, change roles, or alter management leader lists.
- The contact dropdown uses a new choices RPC instead of loading discipleship activity totals. It reuses the existing assignment workspace for ordinary disciple eligibility.

## Verification

`supabase/tests/staff-handoffs.test.mjs` installs the complete migration twice in an empty PostgreSQL instance and uses invented records to test handoff permissions, cross-area boundaries, unchanged statuses/history, assignment times, legacy behavior, deletion, reassignment, badges/list agreement, attention overlap, inactive/pending access, and personal versus branch coaching totals.

```sh
FOLLOW_UP_PGLITE_MODULE=/path/to/pglite/dist/index.js node --test supabase/tests/staff-handoffs.test.mjs
```

After deploying, test a Staff-to-Staff handoff, recipient attention before/after their interaction, sender Go Back membership with appropriate saved filters, attention list back navigation, and a direct Staff/Admin disciple's personal totals. To add the discipleship relationship, use Admin → Users → the person's Discipler selection; no role change is required.
