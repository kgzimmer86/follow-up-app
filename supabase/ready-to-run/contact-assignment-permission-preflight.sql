-- READ ONLY. Run in the live Follow Up project before preparing the permission change.
-- Returns function/policy definitions, not contact rows or credentials.
-- Keep the results private; do not commit the exported results.
select 'function' as kind, p.oid::regprocedure::text as name,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('claim_follow_up_contact', 'get_contact_primary_choices',
                   'assign_contacts_to_follow_up_user')
union all
select 'policy', schemaname || '.' || tablename || '.' || policyname,
       jsonb_build_object('roles', roles, 'command', cmd,
                          'using', qual, 'with_check', with_check)::text
from pg_policies
where schemaname = 'public' and tablename = 'follow_up_contacts'
order by kind, name;
