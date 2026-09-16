# Working together on Follow Up

## Who does what

Glen develops and tests changes in the test environment. His Codex prepares code,
tests, documentation, and SQL. Glen can commit and push his development work for
review. Kyle previews the result, decides what ships, runs approved production SQL
in Supabase SQL Editor, and commits/merges/pushes the approved code to `main` using
GitHub Desktop. Agents do not take those Git or database actions by default.

Repository instructions live in [AGENTS.md](../AGENTS.md). Codex reads repository
instructions when starting work; after these documents are committed, Glen should
pull them and start a fresh task in this repository. Ask it to summarize the project
rules before its first change. See [OpenAI's AGENTS.md guide](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
These instructions guide agents; actual access is controlled by GitHub rules,
Supabase membership, and deployment settings, not this document.

## Environment boundaries

| Environment | Code/site | Database and authority |
| --- | --- | --- |
| Live | `main`; `follow-up-app-red.vercel.app` | Production Supabase; Kyle applies approved changes |
| Shared test | `codex/test-website`; `follow-up-app-git-codex-test-website-michigan-cru.vercel.app` | Follow Up - Testing; test data only |
| Local development | Developer's local branch | Testing or an isolated local fixture database; never production by default |

The known testing project reference is `tcbwepqkvnquxkbtaxcl`. Confirm the project
identity before running SQL. Production identity must be confirmed separately with
Kyle; do not infer it from a signed-in account or an old browser tab.

Test and production are not assumed identical. Any feature may require a targeted
dependency check. Notifications and other integrations may intentionally differ.
Do not import production service-role keys, push credentials, or student data to
make testing look complete. Record intentional differences in the handoff.

## Starting work

1. Accept the GitHub and testing Supabase invitations. Confirm test-app access too;
   repository access, dashboard membership, app login, and preview access are distinct.
2. Pull the approved starting code using GitHub Desktop. For new work, coordinate a
   `codex/` development branch based on the latest approved `main`; do not assume
   the long-lived test branch contains only changes suitable for production.
3. Have Codex inspect the branch, local edits, and applicable instructions before
   editing. Do not lose saved work or restore someone else's stash automatically.
4. Install locked dependencies with `npm ci` when needed. Configure local environment
   values privately, using the testing project's `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Never commit `.env` files. Obtain any
   additional test-only credentials through an approved private channel.
5. Agree on the requested behavior and coordinate any shared test-database change.
   Separate preview branches can still affect the same test database.

## Developing and reviewing

Keep changes focused and reuse existing UI and authorization patterns. Read the
installed Next.js guides before code changes. Preserve the lockfile unless a
dependency change is needed. Do not change permissions simply to satisfy a test.

Run validation proportional to the change:

- Helpers: `node --test src/lib/*.test.mjs`, or the relevant focused test files.
- Database logic: relevant `supabase/tests/*.test.mjs` files with their isolated
  fixtures. Check fixture setup before running; never point tests at production.
- App code: `npm run lint` and `npm run build`. See README for the documented
  environment-specific build fallback; report a failed standard build honestly.
- UI: check the changed flow on mobile and desktop, errors/empty states, and relevant
  permissions. Use fictional contacts. Record manual checks separately.
- Docs only: check links, accuracy, and the diff. No app build or SQL is required.

There is no general `npm test` script currently. Use actual available test commands.
Passing fixture tests is not proof of complete test/production database parity.

Glen commits/pushes reviewed development files to the agreed non-production branch.
Verify the resulting preview's commit and database configuration before asking Kyle
to review. Do not change access controls if deployment or login is blocked; ask Kyle.

## Preparing a release for Kyle

Use [the handoff template](RELEASE_TEMPLATE.md). For database or multi-step changes,
save a filled handoff in `docs/releases/`. It must tell Kyle:

1. **What to run in Supabase:** complete linked SQL files in explicit numbered order,
   the target project, prerequisite checks, expected verification, and when to stop.
   State “No SQL required” if that is the case.
2. **When to deploy code:** state whether each SQL step precedes or follows deployment.
   Explain compatibility with the code currently live. Prefer backward-compatible
   database additions first; incompatible changes need a coordinated plan.
3. **What to transfer to main:** exact release branch/commit(s), file list, dependencies,
   and excluded test-only/private work. Include needed migrations, tests, and docs.
   Do not tell Kyle to merge an entire mixed test branch without reviewing its diff.
4. **How to check and recover:** test results, brief live smoke checks, and a recovery
   plan that accounts for database compatibility and any changed data.

Keep these steps easy to copy. A SQL file must run as a whole in SQL Editor without
requiring Kyle to combine snippets. If a one-off production adjustment differs from
the test migration, explain why and test that exact file too. Never assume filenames
or migration dates alone establish order or prove a script has been applied.

Kyle performs the documented production SQL and GitHub Desktop release steps.
A GitHub push does not apply SQL; running SQL does not deploy code. Verify both
independently. Do not rerun successful SQL merely because code is being deployed.
After Kyle confirms deployment and verification, update the handoff's status.

## Keep private material out of Git

The repository is public. Review individual files, not “commit all.” Do not include
database exports, private audit results, real-contact cleanup/investigation scripts,
credentials, or student screenshots. Use synthetic fixtures for regression tests.
Leave unrelated pending files and stashes alone. Test-only parity corrections must
not be accidentally included in a production SQL checklist.
