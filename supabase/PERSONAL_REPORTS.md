# My Stats and My Activity

Deployment: copy and run the complete SQL files in Supabase SQL Editor in this order, then deploy the app:

1. `migrations/20260910_my_stats.sql`
2. `migrations/20260910_my_activity.sql`

The first defines the shared authenticated reporting window and stats function. The second defines only the paginated activity function. Both are read-only and safely repeatable. No table changes, backfill, ownership changes, or alterations to existing reporting/assignment/filter functions are required. Committing these files to GitHub does not execute them.

Every active, approved user has My Stats and My Activity in the initials menu. The server pages and SQL functions both enforce account approval; neither RPC accepts another person's ID. Events are selected by `performed_by = auth.uid()`, joined to contacts in the latest active campaign. Current contact ownership, discipleship relationships, and saved personal filters do not determine which work is included.

The shared window uses rolling Last 7 days (168 hours), Last 30 days (720 hours), or the full active campaign. Lower and upper boundaries are inclusive; future-dated events are excluded. The UI defaults to Last 7 days, preserves the selected period between the two pages, and resets pagination when the period changes. History dates display in America/Detroit. No active campaign produces an explanatory empty state; request failures use the existing retry screen, not zero counts.

Stats count logged events, not distinct students: knocks, text attempts, interactions, spiritual conversations, interviews completed, KGP shared, received Christ, and invited to CG. Spiritual conversations use the existing coaching definition (spiritual conversation OR interview OR KGP OR received Christ). Each interaction contributes at most once per metric. Only interaction events contribute to ministry completion/invitation metrics; CG text invitations remain text attempts. Edits/deletions naturally affect the next read.

Activity is newest first with event ID as the tie-breaker. Each request fetches at most 26 events to display 25 and determine whether an Older page exists, avoiding a separate full-history count. The timeline shows contact links, text purposes, ministry action flags, notes, and an optional photo link through the existing authorized photo route. Photos are not fetched automatically. Editing remains in the existing contact History page, linked with a return destination containing the activity period, page, and entry anchor.

Report queries run when the report is opened. Menu/report links disable prefetching so these queries are not added to Home startup or run speculatively. The expanded initials menu can scroll on small/zoomed screens. Existing card filters, activity logging, badges, coaching totals, and profile management remain unchanged.

Validation uses only invented data in PGlite:

```sh
FOLLOW_UP_PGLITE_MODULE=/path/to/pglite/dist/index.js node --test supabase/tests/personal-reports.test.mjs
```

Field checks: open both menu entries; change all three periods; confirm your own recent entry appears; open its contact and use Back to results; check an interaction photo link; verify another approved user's pages contain only their own work; and use Older/Newer when more than 25 entries exist.
