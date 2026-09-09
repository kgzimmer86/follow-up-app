# Interaction photo attachment deployment

Run the complete contents of [`migrations/20260908_interaction_photos.sql`](./migrations/20260908_interaction_photos.sql) once in the Supabase SQL Editor before testing the photo attachment in the deployed app.

This migration:

- adds attachment metadata to `follow_up_events`;
- creates the private `follow-up-interaction-photos` Storage bucket;
- limits upload, viewing, and deletion to approved users and active campaign contacts; and
- adds the RPC used when an interaction includes a photo.

It does not change existing interaction rows, contact list queries, Home loading, or the existing interaction RPC used when no photo is attached.
