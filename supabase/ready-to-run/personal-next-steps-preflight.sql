-- READ ONLY. Run against the intended project before either Next Steps migration.
-- Confirm project identity in Supabase separately. No student data is returned.
select current_database() as database_name,
  to_regclass('public.follow_up_next_steps') as next_steps_table,
  to_regprocedure('private.invitation_user_role()') as approved_role_guard,
  to_regprocedure('private.is_approved_user()') as row_policy_guard,
  to_regprocedure('private.community_log_interaction(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean)') as interaction_adapter,
  to_regprocedure('public.log_interaction_with_attachment(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean,text,text,text,integer)') as photo_logger,
  to_regprocedure('public.community_log_outreach(uuid,uuid,uuid,text,text,jsonb)') as invitation_logger,
  to_regprocedure('private.follow_up_push_snapshot()') as push_snapshot,
  to_regprocedure('private.follow_up_push_snapshot_before_next_steps()') as existing_next_steps_push_adapter;

-- Expected before first application: next_steps_table and
-- existing_next_steps_push_adapter NULL; every other prerequisite non-NULL.
select n.nspname,p.proname,pg_get_function_result(p.oid) as return_type,p.prosecdef as security_definer,p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in (
  to_regprocedure('private.community_log_interaction(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean)'),
  to_regprocedure('private.follow_up_push_snapshot()')
);
-- Adapter must return uuid. Inspect unexpected definitions before proceeding.
select column_name,data_type from information_schema.columns
where table_schema='public' and table_name='follow_up_contact_merge_log'
  and column_name in ('kept_contact_id','merged_contact_id');
-- Both UUID columns must exist. Existing reviewed merge must insert the audit
-- before deleting the source contact; verify the installed function if uncertain.
