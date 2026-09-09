# Interaction photo attachment deployment

Run the complete contents of [`migrations/20260908_interaction_photos.sql`](./migrations/20260908_interaction_photos.sql) once in the Supabase SQL Editor before testing the photo attachment in the deployed app.

This migration:

- adds attachment metadata to `follow_up_events`;
- creates the private `follow-up-interaction-photos` Storage bucket;
- limits upload, viewing, and deletion to approved users and active campaign contacts; and
- adds the RPC used when an interaction includes a photo.

It does not change existing interaction rows, contact list queries, Home loading, or the existing interaction RPC used when no photo is attached.

## Photo deletion permission correction

After the original photo migration, run the complete contents of
[`migrations/20260909_interaction_photo_delete_permissions.sql`](./migrations/20260909_interaction_photo_delete_permissions.sql)
in a new Supabase SQL Editor query. Expect “Success. No rows returned.”

- Active student leaders and disciplers can remove their own uploads, provided the photo is not referenced by someone else's interaction.
- Active staff/admin can still remove photos for active-campaign contacts.
- The existing deletion order still works: remove the interaction, then remove its photo through the Storage API. The upload's `owner_id` remains available after the interaction is gone.
- A restrictive deletion policy prevents another broad allow-policy from bypassing this rule. Permissions for other buckets, viewing photos, and uploading photos are unchanged.
- No contacts, history, images, or ownership metadata are altered by this SQL. No app deployment is required for it to take effect. Commit the SQL and this documentation to keep the repository's record current.

Photos uploaded normally through Follow Up have Supabase's automatic uploader ownership. Photos uploaded manually through the Supabase dashboard or a service key may have no owner; those remain removable by active staff/admin. The correction deliberately does not assign ownership to those files.

Validation uses an isolated PostgreSQL database with invented records and actual row-level permissions. It covers ownership, staff/admin access, inactive accounts, hidden/shared references, other buckets, upload/view permissions, and removal after an interaction is deleted. It does not use live student records or delete real Storage objects.

To check the deployed workflow, use a disposable interaction and non-sensitive photo: a student leader should be able to delete their own entry and its photo; staff should be able to delete another user's entry and its photo. Verify the photo is removed from the private bucket as well as from the history. Direct attempts to remove another leader's photo are covered by the automated permission tests.

## Current app behavior and maintenance

The deployment instructions above describe the original database setup and its permission correction. Do not rerun them merely for a documentation update or a photo-link UI change. Committing these SQL files does not execute them in Supabase.

- Contact pages read attachment metadata but do not request signed links for every photo during loading.
- **View interview notes photo** opens a separate tab through `src/app/contacts/[contactId]/photos/[eventId]/route.ts`. The route verifies account access, checks the event belongs to the requested contact, and creates a fresh one-hour private link using the signed-in user's permissions.
- This is a route handler, not a rendered app page: it bypasses the app layout and startup logo. Its redirect and error responses are private and not cached. Preserve this distinction when editing it.
- Failed opening offers a standalone retry; a missing attachment reports that it is no longer available. Never use a service-role key or make the bucket public to simplify viewing.
- Photo-removal failures are retained in a per-user local retry queue. **Retry photo removal** retries cleanup only, not interaction creation/deletion. **Later** hides the notice for that runtime without discarding queued paths.
- Cleanup checks for remaining interaction references before removing a file. An uncertain save must not race a potential successful save by deleting its photo. Use the Storage API, not direct deletion from `storage.objects`.

After deleting a disposable photo interaction, this read-only aggregate can check for stored files without a matching interaction:

```sql
select count(*) as photos_without_an_interaction
from storage.objects photo
where photo.bucket_id = 'follow-up-interaction-photos'
  and not exists (
    select 1
    from public.follow_up_events interaction
    where interaction.attachment_path = photo.name
  );
```

Zero means no unmatched stored files at the time of the query. A nonzero result needs investigation; it is not authorization to delete every unmatched file, because an upload/save may still be in progress.

For photo-link changes, test opening from both Overview and History. For cleanup changes, test a disposable upload/deletion and the retry path. Helper tests are in `src/lib/interaction-photo.test.mjs`; database permission tests are in `supabase/tests/interaction-photo-permissions.test.mjs`.
