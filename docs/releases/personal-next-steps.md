# Personal next steps — first build

For the subsequent Needs Attention card flow and fictional-contact AI testing,
see [the next revision](attention-next-step-ideas.md). Kyle reported this initial
build worked on the test site, including the manual plan actions.

## Summary and status

Adds a My Next Steps tab under My Contacts and a personal plan section on contact
pages. A leader writes a step and chooses a date/time. They can record an
interaction, reschedule, edit, or clear it. Interaction recording and completion
are one database transaction. No AI suggestions or external model calls are
included in this stage.

- Branch: `codex/my-next-steps`, created with Kyle's explicit approval.
- Starting commit: `544b41454a4a26266238efc41d64a3b63ff9b27a`.
- Test release: Kyle authorized committing and pushing the reviewed feature to
  `codex/test-website`. Production remains unchanged.
- Local implementation and fixture testing: prepared.
- Shared testing SQL: Kyle confirmed core migration
  `20260923_personal_next_steps.sql` succeeded. Verification is pending.
  Kyle also confirmed the notification foundation and Next Steps notification
  migrations succeeded. Returned database verification matched all expected
  permissions, row security, functions, and merge trigger. Hosted testing remains pending.
- Hosted preview: NOT DEPLOYED. Preview commit/database identity not yet verified.
- Production SQL, code deployment, and live verification: NOT RUN.
- Default feature state: OFF. Set `NEXT_PUBLIC_NEXT_STEPS_ENABLED=true` at build
  time in the intended environment to expose the workflow and named reminders.

## Behavior and scope

- Plans belong to their author, independently of primary contact assignment.
  Other leaders, including staff/admin, cannot list or change another person's
  plans. Approved users can plan for active campaign contacts, matching existing
  Follow Up interaction scope; Community area permissions are unchanged.
- Normally one pending plan per author/contact. A reviewed duplicate-contact
  merge preserves both plans if each duplicate had one; it does not discard or
  combine intentions. Creation never assigns the contact or writes an interaction.
- A plan contains at most 500 characters and a future time within 366 days.
  Entry uses the device timezone and stores an absolute instant. Display labels
  explicitly use Eastern time. No inferred deadlines or automatic completion.
- Saving through **Record an interaction** completes that step atomically and
  retains normal status, photo, event-invitation, and explicit assignment behavior.
  Ordinary interaction recording elsewhere does not silently complete plans.
- Clears preserve the plan internally as cleared, without an interaction.
  Completed/cleared plans leave the pending list. There is no plan-history UI yet.
- Lists use cursor pagination, with 50 items per page. Account failures deny
  access; loading and mutation failures are visible, with retry/refresh available.
- Version checks reject stale edits/clears/completions. Identical save retries and
  completion retries do not duplicate records. A contact merge invalidates stale
  forms. A campaign archive hides pending plans and removes reminder eligibility.
- Notifications retain existing opt-in devices, five-minute checks, leases,
  retries, and combined badge delivery. A chosen step remains pending until acted
  on; time passing alone does not mark failure.
- For a stale contact with no pending personal plan, the notification says
  **“What’s your next step with {name}?”** and opens that contact's expanded plan
  section. The in-app prompt says **“What’s your next step of faith with {name}?”**
  This first stage supports writing one's own step; three generated suggestions
  are future work, not simulated or hardcoded here.
- Due planned steps take notification priority and say **“How did it go with
  {name}?”**, opening My Next Steps with Record an interaction, Reschedule, Edit,
  and Clear the step. A combined notification highlights one contact; the existing
  lists contain the remaining attention items. It is not one push per student.
- Named reminders include the display name, not notes or plan text. Device
  sign-out and stale-push checks remain in force. No accounts are opted in and no
  messages are sent by installing these files alone. If a scheduler is already
  active, it resumes normal checks automatically after deployment.

## Kyle's ordered release steps

Do these in the shared testing project first. Kyle has authorized proceeding;
no separate confirmation from Glen is pending. Use invented
records only. Testing project reference: `tcbwepqkvnquxkbtaxcl`. Verify the actual
project/account, not just a preview banner. Production identity remains unverified.

1. Confirm the target and run the read-only preflight below. Stop on missing or
   unexpected prerequisites. Do not replay the migration directory to repair them.
2. Run SQL 1, then SQL 2, as complete files in the stated order; run verification.
   Stop on any error. Neither file is an instruction for the agent to execute SQL.
3. In Vercel, set `NEXT_PUBLIC_NEXT_STEPS_ENABLED=true` for the Preview environment,
   scoped specifically to `codex/test-website`, before the next deployment. Confirm
   that branch's Supabase configuration points to the testing project above.
   Review and commit only the files listed below on `codex/my-next-steps` using
   GitHub Desktop. Fetch the latest shared test branch, bring this reviewed feature
   commit into `codex/test-website`, preserving its existing changes, then push that
   test branch. Its connected Vercel deployment should update the test site;
   verify the deployed commit and database isolation. Do not merge the mixed test
   branch into `main`. Stop for review if combining the branches creates conflicts.
4. Complete the hosted checks below. Only after approval, repeat the ordered SQL
   and code steps against separately verified production. Kyle handles production
   SQL and commits/merges/pushes. Record SQL and deployment success independently.

## Supabase: exact files and order

### Testing installation record

Kyle's testing preflight confirmed the core prerequisites and UUID merge columns.
He then reported success applying SQL 1. Do not rerun SQL 1.
The same preflight found `private.follow_up_push_snapshot()` absent. A subsequent
read-only prerequisite check confirmed the required attention functions and tables
were present and checked push objects absent. Kyle then confirmed success running
`20260920_personal_push_notifications.sql`, followed by SQL 2. Do not rerun these
successful migrations. Next run the verification file below; it now returns all
categories in one result table. SQL installation alone does not configure push
credentials or a scheduler.

SQL required: **YES**. Both migrations are transactional schema/function additions;
no real-data cleanup is included. No commands require running outside a transaction.

| Order | Complete file | Timing | Preconditions / stop conditions |
| --- | --- | --- | --- |
| Preflight | [personal-next-steps-preflight.sql](../../supabase/ready-to-run/personal-next-steps-preflight.sql) | Before changes | Both new objects absent; existing guards, interaction adapters, photo logger, invitation logger, push snapshot present; expected merge audit columns |
| 1 | [20260923_personal_next_steps.sql](../../supabase/migrations/20260923_personal_next_steps.sql) | Before code | Installed UUID-returning private interaction adapter; reviewed merge audit precedes source deletion |
| 2 | [20260923_personal_next_steps_push.sql](../../supabase/migrations/20260923_personal_next_steps_push.sql) | After SQL 1, before code | Existing personal push snapshot with contact-attention reader; saved adapter does not already exist |
| Verify | [personal-next-steps-verify.sql](../../supabase/ready-to-run/personal-next-steps-verify.sql) | After SQL | RLS on; authenticated SELECT only on plan table; public RPCs authenticated-only; private helpers not executable by clients; merge trigger enabled |

Dependencies are **definitions**, not an instruction to rerun old migrations. In
particular, the installed `private.community_log_interaction(...)` adapter comes
from the existing invitation interaction-return correction. If it is absent or
unexpected, investigate that environment separately before this release.

Rerun behavior: each new migration intentionally stops if already installed.
An aborted SQL Editor transaction may require `ROLLBACK` before further commands.
Use read-only verification instead of rerunning a successful migration. Existing
loggers are called, not replaced. The push adapter saves its prior reader for
recovery; existing app code ignores extra summary fields. New tables begin empty.
Installing the push adapter changes the fingerprint and can cause one existing
summary refresh per subscribed device; unchanged snapshots then remain quiet.

No new API credentials or model keys are required. Existing push setup is reused.
Do not copy production push credentials into testing.

## Exactly what ships

In addition to this document and `README.md`:

```text
public/sw.js
src/app/api/push/dispatch/route.ts
src/app/contacts/[contactId]/page.tsx
src/app/contacts/next-steps/page.tsx
src/app/notifications/page.tsx
src/components/follow-up/contact-results-page.tsx
src/components/follow-up/interaction-button.tsx
src/components/follow-up/my-contacts-tabs.tsx
src/components/follow-up/next-step-workspace.tsx
src/components/follow-up/next-step-workspace.test.mjs
src/components/follow-up/push-badge-sync.tsx
src/components/follow-up/push-notification-settings.tsx
src/lib/next-steps.ts
src/lib/next-steps.test.mjs
src/lib/push.ts
src/lib/push-dispatch.test.mjs
src/lib/push-worker.test.mjs
supabase/migrations/20260923_personal_next_steps.sql
supabase/migrations/20260923_personal_next_steps_push.sql
supabase/ready-to-run/personal-next-steps-preflight.sql
supabase/ready-to-run/personal-next-steps-verify.sql
supabase/ready-to-run/personal-next-steps-disable-push.sql
supabase/tests/next-steps.test.mjs
```

Exclude pre-existing unapproved drafts `docs/AI_FOLLOW_UP_PROPOSAL.md`,
`docs/ai-evaluation/`, and unrelated
`supabase/ready-to-run/testing-community-parity-correction.sql`. None was read,
edited, deleted, or staged for this build. No private source material, doctrine,
real contact records, credentials, or screenshots are part of the release.

## Verification evidence

Commands run from the repository root:

```sh
node --test src/lib/next-steps.test.mjs supabase/tests/next-steps.test.mjs src/lib/push.test.mjs src/lib/push-dispatch.test.mjs src/lib/push-worker.test.mjs supabase/tests/personal-push.test.mjs supabase/tests/interaction-photo-permissions.test.mjs supabase/tests/invitation-assignments.test.mjs
node --test src/lib/next-steps.test.mjs src/lib/push-dispatch.test.mjs src/lib/push-worker.test.mjs supabase/tests/next-steps.test.mjs
npm run lint
npm run build
NEXT_PUBLIC_NEXT_STEPS_ENABLED=true npm run build
```

- First focused pass: 11/12 passed; the rerun test's cleanup masked the expected
  database error. Fixed the test cleanup, then the broader run passed 52/52.
- Named-reminder revisions: 23/23 passed. Final feature-flag/recovery additions:
  25/25 passed.
- Lint: no errors; only the pre-existing `app-loading.tsx` image warning.
- Standard production build: passed. Feature-enabled production build: passed.
  No webpack fallback was needed. Build did not apply SQL.
- Isolated mobile browser: passed with installed Chrome at 390×844, using real
  components and compiled styles but mocked Supabase transport/Next navigation.
  Covered create/edit/reschedule/record/clear, failed-save retry, empty state, and
  mobile overflow; inspected the invented-data screenshot. This is not a hosted
  authentication or real-device push test.
- The bundled Playwright headless browser was absent initially; reran successfully
  using the installed Chrome channel. No dependencies were downloaded or changed.
- Node/npm sandbox restrictions required approved elevated test/lint execution.
  These were environment access failures, not successful test results.

Reproduce the browser check with an already installed Playwright module and Chrome:

```sh
FOLLOW_UP_PLAYWRIGHT_MODULE=/absolute/path/to/playwright FOLLOW_UP_BROWSER_CHANNEL=chrome node --test src/components/follow-up/next-step-workspace.test.mjs
```

The test skips explicitly without that module setting. It uses a synthetic local
page and invented data only. Run a production build first to supply compiled CSS.
Database fixtures use PGlite in memory with the installed interaction body and
real Community/photo adapters. Unexported production progress triggers and hosted
Supabase/storage configuration are not reproduced; local success is not production
parity. Stale-version conflicts/retries are tested; hosted concurrent sessions
still need the check below.

### Hosted testing still required

- Mobile and desktop with real authentication against **testing**, including a
  pending/inactive account and two different approved leader accounts.
- Create/edit/reschedule/clear a fictional plan; verify no interaction until saved.
  Record with a photo and event invitation; confirm progress/status/history and
  step completion. Verify cancellation leaves the plan pending.
- Two browser sessions: edit or clear a step in one, then attempt to save from the
  stale form in the other. Confirm rejection without a duplicate interaction.
- Approved duplicate-contact merge: preserve both plans; archived campaign stops
  reminders. Do not exercise this with real records as a smoke test.
- A subscribed testing device: due step, named stale prompt, deep links, current
  badge count, foreground refresh, unchanged-state silence, and sign-out handling.
  Confirm the installed service worker updates and other notifications still work.
- Feature off: existing app remains usable, no named prompts or new tab. Feature
  on: in-app name and four reminder actions match the approved wording.

## Recovery

Kyle approval is required before recovery actions. Redeploy the reviewed code with
`NEXT_PUBLIC_NEXT_STEPS_ENABLED=false` to hide the workflow and named prompts.
To restore the prior notification reader, run the complete
[personal-next-steps-disable-push.sql](../../supabase/ready-to-run/personal-next-steps-disable-push.sql).
That file is transactional and safely repeatable, retaining plans and interactions.
Leave additive tables/functions in place; do not drop them or undo recorded contact
history. Re-enabling the push adapter after recovery requires a reviewed corrective
migration, because the installation file deliberately refuses a replay.

No destructive/data-transforming cleanup is planned, so restoration of real data
is not part of normal rollback. Preserve the normal database backup policy. If a
preflight/migration/verification fails, stop before deployment and retain the error
for review; do not improvise SQL or weaken permissions.

## Completion record

- Kyle's branch creation approval: confirmed.
- Release approval: pending.
- Testing core SQL: success reported by Kyle; returned verification passed.
- Testing notification foundation and push adapter: success reported by Kyle.
- Testing database verification: passed from Kyle's SQL Editor results.
- Testing preview / device checks: pending.
- Direct agent deployment access: saved Vercel login rejected; browser-control
  startup failed. Kyle can apply testing SQL and push the test branch instead.
- Production SQL verification: pending.
- Production deployed commit: pending.
- Live smoke checks: pending.
