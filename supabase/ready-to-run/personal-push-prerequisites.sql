-- READ ONLY. Check the intended testing project before installing personal push.
-- One result table so SQL Editor shows every check. No contact data returned.
select
  to_regprocedure('private.my_contact_attention_rows()') as contact_attention,
  to_regprocedure('private.invitation_user_role()') as role_guard,
  to_regprocedure('private.community_checkin_attention(uuid)') as community_attention,
  to_regclass('public.community_event_invitations') as invitations_table,
  to_regclass('public.community_events') as events_table,
  to_regclass('public.follow_up_campaigns') as campaigns_table,
  to_regclass('public.community_group_leaders') as group_leaders_table,
  to_regclass('private.follow_up_push_devices') as existing_push_devices,
  to_regprocedure('private.follow_up_push_snapshot()') as existing_push_snapshot,
  to_regprocedure('public.follow_up_push_claim()') as existing_push_claim,
  to_regprocedure('public.follow_up_push_register(text,text,text)') as existing_push_register;
-- Required attention functions and public tables should be present.
-- Inspect any existing push objects before installing; do not overwrite blindly.
