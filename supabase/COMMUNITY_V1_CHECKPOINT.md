# Community v1 release-candidate checkpoint

Status: automated checks passed; not deployed or approved for production.
Base Git commit: `823444bbbf7d5145bd04335adf3e9a8544acffec`.
This document accompanies the user-authorized local commit named `Community v1 checkpoint`. It is a source baseline, not production deployment approval or a database backup.

## Fresh closeout results

- Lint: zero errors; one pre-existing app-loading.tsx image warning.
- Production build and TypeScript: passed, including /community/history.
- App helper tests: 91 passed, zero failures.
- Local PostgreSQL/PGlite integration tests: 7 passed, zero failures. Covered importer compatibility with and without Community, relationship-preserving merges, rollback on hook failure, permission/attendance/archive boundaries, and the scoped contact query with 10,000 invented contacts.
- `git diff --check`: passed.
- No production deployment, Git push, remote database write, or permission change performed during closeout.

Commands:

```sh
npm run lint
npm run build -- --webpack
node --test src/lib/*.test.mjs
FOLLOW_UP_EXPORTED_SCHEMA=/private/tmp/follow-up-staging-schema.sql FOLLOW_UP_PGLITE_MODULE=/private/tmp/follow-up-text-validation/node_modules/@electric-sql/pglite/dist/index.js node --test supabase/tests/community*.test.mjs
```

These isolated database tests are not an exhaustive production security audit or a substitute for hosted browser tests. Fixture limitations are documented in COMMUNITY_GROUPS_DEPLOYMENT.md.

## Recent source review and user feedback

- User approved the restored Michigan Cru branding, workspace switcher, Community home styling, ESV excerpt, and unboxed group heading.
- History link is staff/admin-only. The history route independently checks authenticated, active staff/admin status before querying archived campaigns. It uses the ordinary authenticated Supabase client; group lists retain existing area/leadership RLS and archived read-only behavior.
- Historical year selection opens /community?campaign=... to preserve existing group Back links. It does not activate a campaign.
- Workspace route/return-path helper tests cover Community contact context and invalid/external return paths.

## Subsequent browser checks and remaining limitations

After the initial stalled attempt, the user explicitly authorized localhost browser access and signed in privately. The agent verified keyboard navigation from Follow Up to Community, Escape dismissal, admin History/empty-history state and Back, group roster contact cards, Community context on contact detail, and Back to the same scoped list. No password was observed and no database changes were saved.

The unsaved-attendance confirmation appeared as expected, but the browser tool could not dismiss it and the temporary tab closed. That attempt is inconclusive, not a failure. The user confirmed this cancellation behavior had already passed manual testing; retain that earlier pass rather than requiring a repeat.

Remaining evidence limits (not established defects):

1. Automated browser work did not cover both viewport sizes or every dismissal mode; user previously approved phone-width styling and switching.
2. Source review identified capture-listener interaction between global navigation feedback and attendance cancellation. Potential transient progress styling after cancellation was not verified; no data-loss failure was established.
3. New history-route staff/admin guard was source-reviewed, not browser-tested under a student account. History had no archived campaigns; older archived-group read-only manual passes remain applicable. Do not archive the active test campaign merely to manufacture a state without planning restoration.

These checks concern the newly changed UI paths. Do not repeat completed attendance/import/merge workflows unless their code paths change.

## Release gates

- Local Git checkpoint authorized by user; includes source, migrations, tests and notes, excluding environment files. Keep this v1 baseline before starting v2.
- Obtain explicit user production approval, verify a database backup, and retain the previous application release.
- Apply reviewed foundation migration then scoped-contact-query migration before deploying matching code.
- Short live smoke check after approval: existing Follow Up contact loads, Community opens for the proper role, approved invented test attendance saves/reopens, unauthorized group access is denied. Expand only if discrepancies appear.

## Deferred v2

Needs Attention from attendance patterns; event invitations; assigned student/ministry relational tasks; staff reporting and attendance grids; named import batches. Discipleship tracking remains in the separate Toolbox app.
