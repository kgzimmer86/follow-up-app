# Text attempts

## Deploy

1. Open `migrations/20260908_text_attempts.sql` and copy the **entire file**, from the opening comment through `commit;` at the end.
2. In Supabase, open **SQL Editor**, create a new query, paste the SQL, and click **Run**. The expected result is success. This is the update to run; `inspect_text_attempt_support.sql` was only the earlier read-only inspection.
3. Commit and push the app changes, then wait for Vercel to finish deploying. Suggested commit name: **Add text attempt tracking**.

The update adds a text-attempt history type and fields for its purposes and event name. It keeps existing knock and interaction routines intact, extends deletion to handle text attempts, and includes the latest text in contact-card results. It does not add Home count queries or change spreadsheet columns.

## Test in the app

Use a contact appropriate for testing.

1. Open the contact and choose **+ Text Attempt**, near **+ Add roommate**. Select **Invite to CG**, add an optional note, and save. The latest text should appear on the contact card, in the contact's Overview, and in History. The green **Invited to CG** indicator should stay unchanged.
2. For a previously Uncontacted student, confirm the status becomes **Attempted Contact**. Provided they meet the smart card's other criteria, they should remain in **Meet Someone New** and should not enter **Go Back** solely because of the text.
3. Choose **Text** on a contact card or contact page, then return from Messages. Choosing **No** should record nothing. Choosing **Yes, log text** should show the same purpose-and-note form. Opening the form and canceling should also record nothing.
4. Try selecting more than one purpose and **Invite to another event** with an event name, such as Barn Bash.
5. In History, edit the text's note/purpose, then delete a mistaken text attempt. The latest-text display should update. Deleting the only attempt returns an **Attempted Contact** student to **Uncontacted**; it does not undo an existing Go Back, Involved, or Not Interested status or remove their primary assignment.
6. Verify Home's **Recent Follow Up** correctly labels the latest activity as a knock, text attempt, or interaction. Check an existing interaction and knock still display normally, including notes and the knock count.

Staff continue to decide when a text exchange is meaningful enough to log using the existing **+ Interaction** form. Text attempts alone do not mark CG invitations complete, count as interactions, or record found-home observations.

The return prompt still needs a check on the installed phone app; local tests simulate leaving and returning. **+ Text Attempt** also supports messages sent directly from the phone's texting app.

## Engineering validation

- `npm run build`
- `npm run lint` (the existing loading-image warning remains)
- `node --test src/lib/*.test.mjs`
- Database tests use an isolated, in-memory PostgreSQL instance with invented records. They never connect to Supabase. Install `@electric-sql/pglite` outside the app and run:

  ```sh
  FOLLOW_UP_PGLITE_MODULE=/path/to/temporary/node_modules/@electric-sql/pglite/dist/index.js node --test supabase/tests/text-attempts.test.mjs
  ```

The database tests cover the complete migration (including reapplication), filters, Home activity, duplicate retries, invalid submissions, permissions, edits, deletions, and preservation of existing statuses/ownership. The unchanged private insert routines are represented by dispatch spies; these verify that only knocks and interactions invoke them. The migration does not replace their bodies.
