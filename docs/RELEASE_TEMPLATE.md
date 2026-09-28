# Release handoff template

Copy this into `docs/releases/<unique-change-name>.md` for a database or multi-step
release. For a small code-only change, these fields may live in the PR description.
Replace placeholders, remove irrelevant rows, and write NONE where appropriate.
This template is not itself an instruction to execute SQL or deploy anything.

## Summary and status

- Change and reason: [plain-language explanation]
- Developer / reviewer: [names]
- Status: [prepared / tested in preview / approved / production SQL applied /
  code deployed / live verification complete — report each independently]
- Approved starting `main` commit: [hash]
- Release branch and code commit(s): [exact names/hashes; pending until committed]
- Preview URL and tested commit: [URL/hash]
- Known limitations / intentional test-live differences: [details or NONE]

## Kyle's ordered release steps

Write one short numbered sequence combining SQL and code actions. Do not leave
Kyle to infer the ordering from separate sections. Include stop conditions.

1. [Confirm production project identity and run the read-only preflight file.]
2. [Run SQL step 1 below, then its verification; stop if unexpected.]
3. [Transfer only the approved release commits/files to main in GitHub Desktop and
   push after the specified SQL succeeds. Or explain the different required order.]
4. [Confirm deployment shows the intended commit as Ready, then perform smoke checks.]

For documentation-only releases, say: “No SQL or runtime changes; commit/push only
the listed documentation files.” Do not use the example steps unchanged.

## Supabase: exact files and order

SQL required: [YES / NO]. If NO, write “No Supabase changes required.”

Target production project: [name and verified reference; no credentials]

| Order | Complete SQL file link | Before/after code deployment | Prerequisites | Expected result / stop condition |
| --- | --- | --- | --- | --- |
| 1 | [actual repository-relative link] | [phase] | [baseline/dependencies] | [result] |

- Exact SQL version: [commit containing these files or file SHA-256 hashes]
- Testing application: [which exact files ran, when, who confirmed, results]
- Production application: [NOT RUN until Kyle confirms; then date/results]
- Data impact: [schema only / data changes; describe affected scope]
- Transaction and rerun behavior: [atomic? already-applied behavior? stop on errors]
- Backup/recovery prerequisite: [appropriate to risk, or why not applicable]
- Current live code compatibility while SQL is applied: [explanation]
- Grants/RLS/privileged function changes: [explicit scope or NONE]
- Other manual settings: [test/production configuration changes, order, or NONE;
  never include secret values]

Do not list an entire migration folder or assume a migration was applied because
it is committed. Link read-only verification SQL and state its expected values.
Do not ask Kyle to copy partial function bodies from a diff.

## GitHub: exactly what ships

- Source branch / commit(s): [approved release only]
- Target: `main`
- Reviewed diff base: [hash]
- Files to include: [explicit paths, including required SQL, tests, and documentation]
- Files/commits to exclude: [test-only settings/banner, private work, unrelated changes]
- Transfer method: [reviewed branch merge or specific commits; explain dependencies]
- GitHub Desktop steps for this release: [short, specific steps Kyle performs]

Do not bypass safeguards or discard local changes. Stop on conflicts or an unexpected
file list. A shared test branch is not automatically a release branch.

## Verification evidence

| Check | Command or manual procedure | Result and tested version |
| --- | --- | --- |
| Regression tests | [actual command] | [pass/fail/not run] |
| Permission/data preservation tests | [actual command or scope] | [result] |
| Lint/build for app changes | [actual commands] | [results; existing warnings separate] |
| Preview smoke check | [fictional-data steps] | [result] |
| Production smoke check (Kyle) | [short non-destructive steps] | [pending/result] |

Explain skipped checks. For docs-only work replace this table with content/link/diff
checks. Do not report a successful deployment as proof every feature works.

## If something fails

- Before deployment: [where to stop; who to contact; whether existing app still works]
- Code recovery: [known-good version and database compatibility]
- Database recovery: [reviewed corrective SQL/restore plan, or additive change left
  in place; do not assume reverting code undoes SQL or restores deleted data]
- Required approval before recovery actions: Kyle

## Completion record

- Kyle's approval: [pending/confirmed]
- Production SQL verification: [pending / not required / confirmed result]
- Production deployed commit: [pending/hash]
- Live smoke checks: [pending/results]

Keep operational details free of real student data and secrets. Do not claim
completion based solely on preparation or testing.
