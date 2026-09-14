# Received Christ celebrations — testing preparation

User approved preview and connecting first-name celebrations for all active
approved users, live or next app open, without startup delay. No historical backfill.

New migration 20260917_received_christ_celebrations.sql creates private feed and
one cursor per profile. Trigger on new/changed received_christ interaction records
publishes only first name. Repeated records for same student do not celebrate again.
Failed transactions roll back feed. Private tables use RLS and revoke direct access.
Feed insertion serializes rare celebrations to keep IDs in commit order.
RPC atomically claims next item for authenticated active user; no user ID parameter.
This prioritizes no duplicate delivery: a lost response/tab closure after claim can
miss a celebration. It is not exactly-once guaranteed visual delivery.

CelebrationListener runs after render (2s), checks visible pages each minute and
on focus (30s throttle), skips open dialogs. Successful Received Christ interaction
dispatches immediate delayed check after modal closes. Animation loads dynamically
only on a celebration. Reduced motion skips fireworks. No realtime subscription.

Main code: layout listener, interaction-button event, celebration-listener.tsx,
celebration-preview.tsx refactored reusable animation, database migration/test.
Preview-only route remains only in approved test copy, not main repository.
New integration NOT yet synced to test: wait for test migration success, then copy
components and PATCH test layout to add listener, preserving its yellow banner.
No production migration/commit/push authorized or performed.

Local database test passed: first-name-only, no item before save, rollback,
per-account dedupe, repeat checkbox dedupe, inactive and direct-access rejection.
Browser integration and load performance not yet verified. Test records must use
a normal invented first name: seeded 'INVITE TEST ...' display names produce INVITE
as first token; create a new invented student named e.g. Alex Example for this check.

User reported test migration success. Synced celebration components and interaction
button to approved test copy; patched its layout with listener without replacing
the yellow test banner. Ready for manual save and cross-account delivery checks.

User manually passed save celebration, delivery on opening second account, and
no repeat after refresh. Final combined release verification passed: 103 tests
(94 helpers + 9 celebration/invitation database tests), build/TypeScript, lint
zero errors and one existing image warning. No hosted performance benchmark.
Production preflight ready-to-run-celebrations-badges-preflight.sql prepared.
Production order after approval: 20260917_received_christ_celebrations.sql,
20260917_community_attention_badges.sql, 20260917_community_checkin_attention.sql.
All three tested; none run in production yet. Get current rollback deployment
and preflight results before guiding one migration at a time. User commits/pushes.
