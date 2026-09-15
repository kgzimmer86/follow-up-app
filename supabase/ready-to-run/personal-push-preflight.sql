-- Read-only. Run before installing 20260920_personal_push_notifications.sql.
select
  to_regprocedure('private.my_contact_attention_rows()') is not null as contact_attention_exists,
  to_regprocedure('private.invitation_user_role()') is not null as active_access_check_exists,
  to_regprocedure('private.community_checkin_attention(uuid)') is not null as group_attention_exists,
  to_regclass('public.community_group_leaders') is not null as group_leaders_exist,
  to_regprocedure('public.community_workspace_counts()') is not null as workspace_counts_exist,
  to_regclass('private.follow_up_push_devices') is not null as push_already_installed;
