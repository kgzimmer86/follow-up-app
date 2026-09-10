# My Contacts attention

Run the complete `migrations/20260909_my_contact_attention.sql` in Supabase SQL Editor, then deploy the app changes. Committing the file does not execute SQL. The migration adds a read-only function; it does not change contacts, statuses, or ownership.

Counts cover the signed-in user's primary contacts in active campaigns, independent of personal filters and default area:

- Never attempted: no logged knock, text attempt, or interaction.
- Stale Go Back: status Go Back and latest logged activity at least seven days ago.
- New believer: received Christ at least 24 hours ago, with no interaction strictly later than that timestamp. The original conversion interaction is not a follow-up. Text attempts and knocks do not clear this category.
- Total: each contact matching one or more categories counted once.

The expandable section is on My Contacts. The mobile My Contacts icon has a red badge only when the unique total is positive. The categories are counts, not additional personal filters. No coaching exemptions or geographic filters are applied to these reminders.

Counts load on the client independently of startup, are shared between section and badge, and refresh after route/server refresh changes, foregrounding, or once a minute while visible. Failed reads show a retry in the section and suppress the badge rather than display a false zero. These are not push notifications.

Verify: an unattempted assigned contact; an old Go Back; an old conversion with and without a later interaction; an overlap; zero total; a different user's ownership; and unchanged counts when personal filters change. Database tests use invented records in PGlite:

```sh
FOLLOW_UP_PGLITE_MODULE=/path/to/pglite/dist/index.js node --test supabase/tests/my-contact-attention.test.mjs
```
