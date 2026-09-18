# Needs Attention cards and AI test integration

Test branch: `codex/test-website`. Production is outside this release.
Previous Next Steps setup was applied and verified by Kyle in testing; Kyle
reported its create/edit/reschedule/record/clear flow worked on the test site.

Needs Attention expands inline under My Contacts. Its category cards reveal
contacts with a My Next Step menu. Named assigned, stale, and new-believer push
reminders open the corresponding category and locate the named contact using the
same authorized paginated reader. If the contact no longer qualifies, the page
says so. Old attention-page links redirect into this flow. My Next Steps remains
the secondary list of chosen plans. Due plans still open that list.

The menu supports three requested AI ideas and writing one's own. A selected
idea is editable before choosing a date/time. No suggestion schedules a plan or
records an interaction automatically. Pending plans suppress named attention
prompts without changing the underlying attention tags. Notifications continue
to use the existing combined push delivery; this is not SMS or one notification
per contact. Actual push delivery still requires its existing scheduler/setup.

## Testing installation order

1. Target Follow Up – Testing, project `tcbwepqkvnquxkbtaxcl`.
2. Run the complete [20260924_attention_next_steps.sql](../../supabase/migrations/20260924_attention_next_steps.sql).
   Requires the two previously applied 20260923 migrations and the personal push
   foundation. Transactional; refuses a repeat installation. Does not change
   contacts or interactions. Saves the prior push reader and adds a private AI
   request budget, serialized per account (one per minute, ten per hour).
3. Run [attention-next-steps-verify.sql](../../supabase/ready-to-run/attention-next-steps-verify.sql).
   Every column should be true. Stop on errors rather than replaying migrations.
4. Configure the following Vercel variables for Preview, branch
   `codex/test-website` only. Keep the existing `NEXT_PUBLIC_NEXT_STEPS_ENABLED=true`.
5. Push only the reviewed test commit and verify the resulting deployment.

| Setting | Value |
| --- | --- |
| `OPENAI_API_KEY` | Private API project key; Secret |
| `OPENAI_NEXT_STEPS_MODEL` | `gpt-4.1` for this initial test; can be changed privately |
| `NEXT_STEPS_AI_ENABLED` | `true` |
| `NEXT_STEPS_MINISTRY_GUIDANCE` | Approved guidance supplied privately by Kyle; Secret; never in Git |
| `NEXT_STEPS_AI_TEST_CONTACT_IDS` | Comma-separated UUIDs of explicitly invented test contacts; never real contacts |

Create a project key in the OpenAI API dashboard and configure API billing there.
Use [the official quickstart](https://developers.openai.com/api/docs/quickstart).
The [model documentation](https://developers.openai.com/api/docs/models/gpt-4.1)
and [structured output guide](https://developers.openai.com/api/docs/guides/structured-outputs)
describe the request format used here. API availability/billing must be verified
with the actual project before live testing. No key is supplied with this code.

## Private data and boundaries

Kyle approved private server storage of the approved guidance and sending it to
the AI provider only for fictional-contact testing. No source PDF, ministry
guidance, or prior unapproved drafts are included in this change. The private
guidance value must be supplied separately; code refuses to invent a substitute.

API calls require an approved active account, same-origin POST, the exact testing
database, non-production environment, explicit AI enablement, a contact in the
fictional allowlist, active campaign, and primary assignment to the caller.
Queries use the caller's RLS-protected client, never a service key. Direct contact
identifiers, names, phone numbers, addresses, photo attachments, and profile
identities are omitted. Free-text fictional notes are included as essential
context. Complete paginated event history and visible community memberships,
attendance, and event invitations are used. Missing community data is explicitly
unknown. Query failures or oversized histories refuse generation rather than
silently discarding older commitments. Notes are treated as data, not instructions.

Requests use `store:false`, no tools, a timeout, structured output, and output
validation. This is not a claim of zero provider retention. Context, guidance,
credentials, and provider response bodies are not logged. Suggestions are held
in the component; only the leader's chosen saved plan is persisted. Budget
records contain owner and timestamp only.

## Validation and remaining checks

Passed locally:

```sh
node --test src/lib/next-step-ideas.test.mjs src/lib/next-steps.test.mjs src/lib/push-worker.test.mjs src/lib/push-dispatch.test.mjs supabase/tests/next-steps.test.mjs
npm run lint
NEXT_PUBLIC_NEXT_STEPS_ENABLED=true npm run build
FOLLOW_UP_PLAYWRIGHT_MODULE=/absolute/path/to/playwright FOLLOW_UP_BROWSER_CHANNEL=chrome node --test src/components/follow-up/next-step-workspace.test.mjs
```

30 regression tests passed; mobile browser fixture passed; build passed. Lint
has no errors and the existing `app-loading.tsx` image warning. An initial test
still expected the old notification destination and was updated to the new
category link; the AI test harness's reserved variable name lint error was fixed.
The verification SQL was executed against the isolated fixture and all checks
were true. No real API call has run; a key and private configuration are pending.

Local fixtures exercise the actual migrations, denied callers, category
selection, pending-plan suppression, AI budget, model failures, incomplete
context, and server environment/allowlist gates. A mobile browser fixture uses
real components and mocked transport to check the expanded category and editable
idea flow. These do not prove hosted PostgREST relationship queries or provider
access; verify both with an allowlisted fictional contact after setup.

Hosted SQL application, private environment configuration, AI billing/key setup,
actual AI output quality, subscribed-device push, and test deployment are pending
for this revision. No production action has been performed.

## Recovery

Set `NEXT_STEPS_AI_ENABLED=false` and redeploy testing to disable AI requests;
manual plans still work. Revert the code commit to return to the earlier UI.
The additive SQL remains compatible with that earlier code; preserve plans and
interaction history. Do not drop the private budget or overwrite snapshot
functions as a shortcut. No production migration is authorized by this handoff.
