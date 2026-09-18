# Restore the test app before Next Steps

Kyle requested removal of the full experiment, not just hiding its menus.
This reverses feature commits `759268c` and `5949c65` on `codex/test-website`.
Application files under `src/` and `public/`, and README, match `14e9398`, the
pre-feature state with the unrelated contact-merge wording correction retained.
The original Needs Attention category pages and notification wording return.
The My Next Steps route, AI endpoint, next-step menus, and all AI requests are removed.

Production branch and database are unchanged. Private unapproved drafts and the
unrelated testing correction remain untracked and untouched. The three already
applied historical SQL migrations are retained as history; do not rerun them.

## Testing steps

1. In Follow Up – Testing (`tcbwepqkvnquxkbtaxcl`), run the complete
   [testing-restore-original-attention.sql](../../supabase/ready-to-run/testing-restore-original-attention.sql).
   All three verification columns should return true. It restores the exact
   original saved push reader, whether one or both Next Steps adapters were applied.
   Transactional and safely repeatable; stops if the original reader is unavailable.
2. Push the rollback commit on `codex/test-website` using GitHub Desktop and wait
   for that Preview deployment. Do not push or merge to `main`.
3. Reload the test app. Verify no My Next Steps tab, no next-step menus on contacts,
   and original Needs Attention category navigation. Confirm normal interaction
   recording still works with a fictional contact.

Unused additive tables, saved functions, and test plans remain in Supabase to
avoid destructive cleanup. They have no app entry point or AI integration after
the rollback. The earlier personal push foundation remains installed; no scheduler,
device registrations, or integration credentials are added by this rollback.
No Supabase deletion or production SQL is needed. Existing disabled feature flags
can remain; the restored app does not read them.

Recovery from this rollback would require deliberately reverting the rollback
commit and reviewing database adapters; do not replay previously applied migrations.
Hosted SQL and deployment status must be confirmed by Kyle separately.

## Local validation

```sh
node --test src/lib/push.test.mjs src/lib/push-dispatch.test.mjs src/lib/push-worker.test.mjs src/lib/community-attention.test.mjs supabase/tests/personal-push.test.mjs
npm run lint
npm run build
```

21 tests passed, including executing the complete recovery SQL twice against an
isolated fixture and verifying preserved contact/device records and denied client
execution. The initial new test failed because of fixture SQL quoting; corrected
and rerun successfully. Lint passed with only the existing loading-image warning.
Build passed and contains no Next Steps or AI route. Exact application diff against
`14e9398` is empty for `src/`, `public/`, and README. Diff whitespace checks passed.
