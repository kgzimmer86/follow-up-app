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
