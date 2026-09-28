# One-time startup loading screen

Prepared on `main`; not committed, pushed, or deployed by the agent. No SQL,
database data, filter rules, authentication, or service-worker changes.

The old root fallback displayed the launch animation whenever runtime suspended,
while a separate first-page fallback exposed the shell without that animation.
The new persistent startup boundary shares initial loading state across both.
Completion is latched after the first page commits, never reset by navigation,
refresh actions, or background/resume within the same document. New documents
start fresh. Login, approval, and recovery screens also complete startup.
Later suspensions show the existing page indicator. Fast loads have no forced delay.

## Kyle's steps

1. Commit only these four files on `main`, summary `Keep launch animation limited to initial startup`:
   - `src/app/layout.tsx`
   - `src/components/follow-up/app-startup.tsx`
   - `src/lib/app-startup.test.mjs`
   - `docs/releases/startup-loading-lifecycle.md`
2. Push and wait for the matching Vercel deployment to be Ready. No SQL required.
3. On iPhone, cold-open with a slow connection: static iOS screen, then animation
   if still waiting, then content. Navigate, change filters, return Home, and
   background/resume: the launch animation must not return. Check a fast open,
   sign-in and error/recovery paths too. Normal navigation indicators remain.

iOS owns the static launch screen and can retain a previous app snapshot. The app
cannot animate until its document arrives (including proxy/auth response time).
The attached recording could be read but wasn't decoded in this environment.
Device-level reproduction/verification remains pending; no claim of a verified
iPhone fix before Kyle checks it.

## Checks and recovery

- Targeted ESLint and `next build --webpack`: passed.
- `node --test src/lib/app-startup.test.mjs`: covers real React server rendering
  for slow/fast startup plus structural regression checks for the one-way latch
  and page-boundary placement. Does not replace client/device lifecycle testing.
- Production SQL: not required. Production commit/deployment/smoke check: pending.
- Recovery, if needed: Kyle reverts this code-only commit. No database rollback.
- Keep unrelated/test-branch work out of this release.
