<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Follow Up project instructions

Read [the development workflow](docs/DEVELOPMENT_WORKFLOW.md) before working. For a
release, use [the release handoff template](docs/RELEASE_TEMPLATE.md). Preserve the
generated Next.js instructions above.

## Authority and environments

- Kyle owns production releases. Agents prepare code, SQL, documentation, and tests;
  Kyle runs production SQL and commits/merges/pushes production code himself.
- Do not commit, push, merge, switch/create branches or worktrees, deploy, or change
  a remote database unless explicitly authorized for that specific operation.
  “Fix this” or “get this live” does not replace this workflow.
- Inspect the current branch and working-tree changes first. Preserve unrelated
  edits and stashes. Do not use blanket staging or destructive Git commands.
- Production and testing use separate Supabase projects/accounts. Verify the target
  before any database operation. Never copy production credentials or real student
  data into testing. A preview URL or banner alone does not prove database isolation.
- Testing is shared: coordinate schema changes with the other developer. A new Git
  branch does not create a separate database.
- Never weaken branch protections, authentication, RLS, or deployment protection
  to make a task pass. Report missing access instead.

## Code and data standards

- Make the smallest maintainable change that meets the request; avoid unrelated
  refactors, dependencies, and formatting churn. Follow existing TypeScript,
  component, design, and product terminology conventions.
- Preserve mobile usability, accessibility, loading/error states, and field workflows.
  Validate untrusted input server-side. Do not hide errors with type suppressions
  or grant access when a permission check fails.
- Preserve contact assignments, interactions, import history, and survey information
  unless the requested change explicitly says otherwise. Identity conflicts require
  review, not speculative automatic merges.
- This repository is public. Never commit secrets, `.env` files, database exports,
  real contact names/IDs, private investigation SQL, or screenshots containing data.
  Use invented test fixtures. Review the exact changed-file list before handoff.

## Database changes

- Deliver complete, copyable SQL files, not fragments or instructions to reconstruct
  SQL from a diff. Put releasable changes in `supabase/migrations/`; clearly mark
  test-only corrections as NOT FOR PRODUCTION and exclude them from release files.
- Do not edit an already-applied migration to silently change its meaning. Add a
  new uniquely named migration; inspect existing names for collisions. Filenames
  are not an execution plan: document dependency order explicitly.
- Never replay the migration directory to synchronize projects. Inspect the specific
  definitions, dependencies, and permissions that the change needs.
- Include safe preconditions, transaction boundaries where supported, rerun behavior,
  and read-only verification. State when a statement cannot run in a transaction.
  Stop on an unexpected baseline rather than overwriting it blindly.
- Preserve least-privilege grants and RLS. For privileged functions, review caller
  authorization, schema-qualified references, safe `search_path`, and execute grants.
  Test permitted and forbidden callers; do not blanket-grant access.
- Separate schema changes from real-data cleanup. Destructive/data-transforming work
  needs explicit approval and an appropriate recovery plan before execution.
- Test success does not mean production success. SQL Editor application, Git commits,
  and Vercel deployments are separate events; record their status separately.

## Tests and handoff

- For code changes run focused regression tests, lint, and a production build as
  described in README. Add a regression test for a fixed bug when feasible. For
  SQL changes test behavior and permissions with isolated invented data.
- Cover relevant role/campus boundaries, denied access, malformed input, and
  preservation of existing data. Add concurrency/stale-review tests when relevant.
- Report exact commands and results, including failures, skipped checks, and manual
  checks still needed. Never claim a test ran or a release succeeded without evidence.
- Documentation-only work needs link/content/diff checks, not a build or SQL run.
- Every releasable change needs a handoff identifying SQL required (or explicitly
  NONE), ordered full-file paths, target, prerequisites, deployment order, exact code
  files/commits, tests, verification, and recovery. Use the template without padding
  irrelevant sections. Keep Kyle's next actions short and numbered.
- Update existing feature documentation when behavior changes. A complex handoff
  belongs in `docs/releases/<unique-change-name>.md`; a small code-only change may
  use the same fields in its PR description. Do not leave essential SQL order only
  in a chat. Do not mark production steps complete until Kyle confirms them.
