# Mobile scroll-up pagination

Prepared on main; Kyle commits/pushes. No SQL, permissions, data or filtering changes.
Shared contact results (including Community contact lists) gain a floating mobile
paginator on multi-page results only. Desktop and regular pagination are unchanged.
Upward travel of 16px reveals it; downward travel hides it. It is suppressed near
the top, above results, and while the regular paginator is visible. It measures
bottom navigation height including safe-area spacing. Hidden controls are inert;
reduced-motion preferences remove transitions. Existing filters/sort/links persist.

Commit these five files with summary `Add mobile scroll-up pagination`:
- `src/components/follow-up/mobile-results-paginator.tsx`
- `src/components/follow-up/contact-results-page.tsx`
- `src/components/follow-up/app-shell.tsx`
- `src/lib/mobile-results-paginator.test.mjs`
- `docs/releases/mobile-results-paginator.md`

After push and Vercel Ready, test on phone: scroll down/up, small jitter, regular
paginator visibility, first/last pages, filters preserved, orientation changes,
bottom navigation spacing and a single-page list. Check desktop remains unchanged.
Device checks/deployment pending Kyle. This does not add pagination to independent
invitation tables or Needs Attention lists. Recovery: revert this code-only commit.

Validation commands: `node --test src/lib/mobile-results-paginator.test.mjs`,
targeted ESLint on the three changed components, and `next build --webpack`.
Scroll tests use a simulated DOM; real iPhone scrolling remains a manual check.
