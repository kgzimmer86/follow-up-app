# Contact-page Staff/Admin handoffs

## Status and scope

Prepared on `main`, baseline `7bbedf94ae2ec810b77ff868d4247da02ff42158`.
Kyle approved preparing directly for main. Commit, production SQL, deployment, and
live verification remain pending. No remote database changes were made by the agent.

- Student Leaders: self (existing claim rules), or active Staff/Admin.
- Disciplers: self, existing eligible **direct** disciples, or active Staff/Admin.
- Staff/Admin: existing contact-page options unchanged.
- Bulk assignment, self-claim RPCs, RLS, and existing contact visibility unchanged.

The live audit supplied by Kyle shows contact SELECT access for approved users and
self-claim access to active-campaign contacts without an area boundary. New staff
handoffs use that movement-wide scope, but exclude Not Interested and non-current
campaign contacts, matching the existing staff-handoff eligibility. Self-claim
behavior is deliberately unchanged. Ordinary disciple assignments retain existing
area/ownership restrictions. Recipient choices are checked again when saving.

## Kyle's ordered steps

1. Confirm the SQL Editor is in the **live Follow Up** project that supplied the
   permission audit, not Follow Up - Testing (`tcbwepqkvnquxkbtaxcl`). The live
   reference has not been independently verified by the agent.
2. Run the entire [migration](../../supabase/migrations/20260924_contact_page_staff_handoffs.sql).
   Expect `choices_installed=true` and `assignment_installed=true`. Stop on errors.
3. On `main`, commit only the six files listed below. Suggested summary:
   `Allow contact-page staff handoffs for leaders and disciplers`.
4. Push, wait for Vercel Ready, then check the Primary dropdown using the relevant
   roles. On an approved test contact, verify a handoff and its assignment history.
   Do not reassign real contacts merely to test without the owner's agreement.

## Exact files to commit

- `src/app/contacts/[contactId]/page.tsx`
- `src/components/follow-up/primary-assignment.tsx`
- `supabase/migrations/20260924_contact_page_staff_handoffs.sql`
- `supabase/ready-to-run/contact-assignment-permission-preflight.sql`
- `supabase/tests/staff-handoffs.test.mjs`
- `docs/releases/contact-page-staff-handoffs.md`

Exclude AI drafts, testing-only parity SQL, stashes, and audit results. No branch
merge is required. Stop if the file list differs unexpectedly.

## Database details

SQL is required **before code deployment**. The migration adds two contact-page
RPCs; it does not replace existing assignment RPCs or modify contact rows. Existing
production code continues working before the new code deploys. New RPCs are
security-definer with an empty search path, role checks, and authenticated-only
execute grants. Public/anon execute is revoked. Contact updates are locked and
actor/recipient activation is rechecked. Assignment metadata triggers remain intact.

The migration is transactional and rerunnable for this version. It stops if required
RPCs are missing or unrecognized functions occupy the new names. No backup is needed
for a data rewrite because installation does not rewrite data. This file is the
only migration to run; do not replay the migration directory.

## Verification evidence

- `node --test supabase/tests/staff-handoffs.test.mjs`: 7 tests passed in isolated
  PGlite with invented records; no remote database connection. Covers new handoffs,
  direct-only choices, forbidden targets/callers, closed campaigns, Not Interested,
  cross-area staff recipients, metadata/history preservation, rerun, execute grants,
  and unchanged existing function definitions and bulk permissions.
- `node node_modules/eslint/bin/eslint.js`: no errors; one existing image warning
  in `app-loading.tsx`.
- `node node_modules/next/dist/bin/next build --webpack`: passed, including TypeScript.
- Commands used the bundled Node runtime. Browser/production smoke checks pending.
- An initial test failure exposed a pending-recipient error-message mismatch;
  pending recipients now receive the explicit active-assignee rejection; final run passed.

## Recovery

Before pushing, stop on any SQL error; a failed migration transaction leaves the
existing functions intact. After deployment, Kyle can revert this release's UI
commit and push; the additive RPCs can remain installed. If the new permissions
must also be disabled, Kyle may run this complete transaction:

```sql
begin;
revoke execute on function public.assign_contact_page_primary(uuid,uuid) from authenticated, anon, public;
revoke execute on function public.get_contact_page_primary_choices(uuid) from authenticated, anon, public;
commit;
```

That disables new calls but does not undo completed assignments. Any correction to
an actual assignment needs separate Kyle approval. Rerunning the migration restores
its execute grants, so do not rerun after intentionally disabling it without review.
