# Community Needs Attention badges

Prepared in main repo, not yet activated in test. User requests group-tab count,
Groups navigation count, and combined Groups + Invitations count on Follow Up's
workspace switcher. Existing invitation badge remains initial invitation tasks;
amber no-response reminders are not newly added to its red badge.

Migration 20260917_community_attention_badges.sql adds one aggregate RPC combining
existing invitation counts with active-group two-absence counts. Uses current
membership start date, explicit absence records, active campaign/group and group
access checks. Counts group/student follow-ups, so one student flagged in two
groups contributes two, matching the sum of the group cards. No lists of contacts
are sent to calculate the navigation count. Existing post-render interval reused.

Local targeted database test passed: sums, designated access, missing records and
membership reset. Build/TypeScript passed. No browser check or production change.
Next: user runs test migration, then sync invite-attention.tsx, app-shell.tsx,
group page, attendance-checklist.tsx and delete-meeting.tsx to approved preview.

User reported test migration success. All five files synced to approved test
preview. Manual count and workspace-sum checks pending; production unchanged.

User clarified badge means needs check-in. New migration
20260917_community_checkin_attention.sql centralizes eligibility for card, tab,
list and navigation count. Clears on attending, interaction Invited to CG,
ended membership or not_interested. Two explicit absences after last check-in
date (America/Detroit; same-day meetings do not count after check-in) reopen.
Shared campaign contact interaction clears across groups; text attempts do not.
Targeted DB test passed all clearing rules and reopen. Build/TypeScript passed.
NOT YET RUN in test or synced. After user runs migration, sync community-server.ts,
community/page.tsx, group page, needs-attention.tsx, interaction-button.tsx.

User reported check-in migration success in testing. Synced all five listed files
to approved preview. Manual check-in clearing check next; production unchanged.

User passed check-in clearing and Follow Up workspace badge sum manually.
Final combined check: 103 tests, build/TypeScript passed; lint zero errors, one
existing warning. See CELEBRATIONS_CHECKPOINT.md for production sequence.
