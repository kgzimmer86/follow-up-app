-- READ ONLY. Run in production ghsoqsuotjhfetbkbsdr; paste the results for review.
with checks as (
  select 1 as number,'Community prerequisites exist' as check_name,
    to_regclass('public.community_events') is not null
    and to_regclass('public.community_event_invitations') is not null
    and to_regclass('public.community_group_memberships') is not null as ok
  union all select 2,'Recipient relationship tables exist',
    to_regclass('public.discipleship_relationships') is not null
    and to_regclass('public.profile_ministry_area_assignments') is not null
  union all select 3,'Invitation assignment extension not already installed',
    to_regclass('public.community_invitation_outreach') is null
    and not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='community_event_invitations' and column_name='assigned_to')
  union all select 4,'Exactly one compatible contact query exists',
    (select count(*)=1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='get_follow_up_contact_results_v2'
      and 'p_spreadsheet_status'=any(p.proargnames))
  union all select 5,'Existing interaction returns void with expected insertion shape',
    exists(select 1 from pg_proc p
      where p.oid=to_regprocedure('public.log_interaction(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean)')
      and p.prorettype='void'::regtype
      and p.prosrc ~* 'insert[[:space:]]+into[[:space:]]+public[.]follow_up_events'
      and p.prosrc ~ 'p_found_home[[:space:]]*\)[[:space:]]*;')
  union all select 6,'Existing photo interaction function exists',
    to_regprocedure('public.log_interaction_with_attachment(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean,text,text,text,integer)') is not null
  union all select 7,'Invitation lookup/query functions not already installed',
    not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('community_assign_invitations',
      'get_invitation_contact_results','get_invitation_assignment_results','community_invitation_recipients'))
)
select number,check_name,case when ok then 'PASS' else 'STOP — inspect before migrating' end as result
from checks order by number;
