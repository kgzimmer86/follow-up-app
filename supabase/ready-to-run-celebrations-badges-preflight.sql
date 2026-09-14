-- Read only: run in PRODUCTION ghsoqsuotjhfetbkbsdr before this release.
with checks as (
  select 1 as number,'Existing invitation count function exists' as check_name,
    to_regprocedure('public.community_invite_counts()') is not null as ok
  union all select 2,'Group access helper exists',
    to_regprocedure('public.can_access_community_group(uuid)') is not null
  union all select 3,'Interaction columns exist',
    (select count(*)=8 from information_schema.columns where table_schema='public' and table_name='follow_up_events'
      and column_name in ('id','contact_id','performed_by','event_type','occurred_at','received_christ','invited_to_community_group','notes'))
  union all select 4,'Celebration tables and trigger not already installed',
    to_regclass('private.received_christ_celebrations') is null and to_regclass('private.celebration_cursors') is null
    and not exists(select 1 from pg_trigger where tgrelid=to_regclass('public.follow_up_events') and tgname='received_christ_celebration')
  union all select 5,'New badge and celebration functions not already installed',
    to_regprocedure('public.community_workspace_counts()') is null
    and to_regprocedure('public.community_group_checkin_attention(uuid)') is null
    and to_regprocedure('public.take_received_christ_celebration()') is null
)
select number,check_name,case when ok then 'PASS' else 'STOP — inspect before migrating' end as result
from checks order by number;
