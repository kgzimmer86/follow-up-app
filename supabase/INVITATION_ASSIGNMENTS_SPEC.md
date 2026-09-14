# Invitation responsibility and outreach

Approved workshop decisions, September 14, 2026. Implementation is local until tested
and separately approved for release. No production SQL or release is authorized.

- One responsible user per student/event; never changes Follow Up primary ownership.
- Staff/admins assign/reassign to active leaders, disciplers, staff/admins. Disciplers
  assign only unassigned invitations, to leaders/discipler accounts. Leaders claim only
  unassigned invitations for themselves. Assignment is atomic and checked at save.
- Bulk assignments show event, recipient and selected contacts before saving. Contacts
  need not belong to a Community group. Existing contact access is not changed.
- Already-invited/responded students cannot receive a new initial-invitation assignment.
- Anyone's recorded invitation satisfies the initial invitation task. The existing
  assignee remains responsible; otherwise the person recording outreach becomes assignee.
- My Invites sits under Events. Red counts assigned initial invitations still needed.
  Amber marks Invited with no response logged for 72 hours since the last recorded
  invitation/reminder. Maybe/Coming/Can't come count as responses.
- Any user's recorded reminder restarts that shared clock. Merely opening Messages,
  viewing a contact, editing a note, or changing an assignee must not restart it.
- Closed events and events before today's America/Detroit date have no action cues.
  History persists. There is no automatic primary ownership or new My Contacts entry.
- Existing text confirmation and interaction logging select a campaign event. Logging
  outreach and updating invitation state must be one database transaction, with a
  submission identifier for retries. Existing responses are preserved unless changed.
- The workspace selector shows outstanding work in the other workspace; Community's
  Events/My Invites shows the corresponding count. No new prominent Follow Up Home link.
- Badge fetching starts after render, returns aggregate counts only, and is deduplicated/
  throttled across focus, visibility and change events. No badge query in server layout.

Before release: isolated tests for roles, assignment races/stale saves, text retry,
interaction failure rollback, reminder timing/date expiry, merge preservation, and
indexed badge performance with invented records; then focused hosted testing.
