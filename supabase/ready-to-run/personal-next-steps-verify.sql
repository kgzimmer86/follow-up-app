-- READ ONLY. Run after both ordered migrations. No contact data is returned.
-- Return every category in one result table for SQL Editor.
select 'row_security' as check_name, coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb) as details from (
select relrowsecurity as row_security_enabled from pg_class
where oid='public.follow_up_next_steps'::regclass
) result
union all
select 'policies', coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb) from (
select policyname,cmd,roles from pg_policies
where schemaname='public' and tablename='follow_up_next_steps'
) result
union all
select 'table_permissions', coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb) from (
-- Expected: RLS true; one owner SELECT policy, no client write policies.
select role_name,
  has_table_privilege(role_name,'public.follow_up_next_steps','SELECT') as can_select,
  has_table_privilege(role_name,'public.follow_up_next_steps','INSERT') as can_insert,
  has_table_privilege(role_name,'public.follow_up_next_steps','UPDATE') as can_update,
  has_table_privilege(role_name,'public.follow_up_next_steps','DELETE') as can_delete
from unnest(array['anon','authenticated']) role_name
) result
union all
select 'function_permissions', coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb) from (
-- authenticated SELECT only; anon all false.
select p.oid::regprocedure as function_name,p.prosecdef as security_definer,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname like 'follow_up_next_step%')
  or (n.nspname='private' and p.proname in ('next_steps_on_contact_merge','follow_up_push_snapshot','follow_up_push_snapshot_before_next_steps'))
order by 1
) result
union all
select 'merge_trigger', coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb) from (
-- Public next-step RPCs: authenticated true, anon false; private functions: both
-- false. All security definer true and search_path empty.
select tgname,tgenabled from pg_trigger
where tgrelid='public.follow_up_contact_merge_log'::regclass and tgname='next_steps_transfer_on_merge'
) result;
-- Expected one enabled trigger (O).
