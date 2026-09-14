-- TEST ONLY: run in tcbwepqkvnquxkbtaxcl. No production migration.
-- Selects ONE assigned, Invited demo contact for an open upcoming TEST event.
-- Save the returned restore_sql if you want to undo the clock change without
-- logging a reminder. Restoration refuses to overwrite subsequent app activity.
begin;
do $$
begin
  if not exists(select 1 from public.follow_up_campaigns
    where id='290aaf10-2d90-4b60-8768-723e6470baf4' and status='active' and label ilike '%test%') then
    raise exception 'Expected TEST campaign missing. Stop; do not change this guard.';
  end if;
  if not exists(select 1 from public.community_event_invitations i
    join public.students s on s.id=i.student_id
    join public.community_events e on e.id=i.event_id
    where e.campaign_id='290aaf10-2d90-4b60-8768-723e6470baf4'
      and e.name ilike 'TEST %' and e.is_open
      and e.event_date >= (now() at time zone 'America/Detroit')::date
      and s.id::text like 'd3140001-0000-4000-8000-%'
      and s.umich_email ~ '^invitetest(0[1-9]|1[0-2])@example[.]invalid$'
      and i.status='invited' and i.assigned_to is not null
      and i.first_invited_at is not null and i.last_outreach_at>now()-interval '3 days') then
    raise exception 'No eligible demo invitation. Log a test invitation with response Invited for an assigned INVITE TEST contact in an upcoming TEST event, then rerun.';
  end if;
end; $$;
with target as materialized (
  select i.event_id,i.student_id,i.first_invited_at as original_first,
    i.last_outreach_at as original_last,i.version,s.display_name,e.name as event_name,
    p.display_name as assigned_to
  from public.community_event_invitations i
  join public.students s on s.id=i.student_id
  join public.community_events e on e.id=i.event_id
  join public.profiles p on p.id=i.assigned_to
  where e.campaign_id='290aaf10-2d90-4b60-8768-723e6470baf4'
    and e.name ilike 'TEST %' and e.is_open
    and e.event_date >= (now() at time zone 'America/Detroit')::date
    and s.id::text like 'd3140001-0000-4000-8000-%'
    and s.umich_email ~ '^invitetest(0[1-9]|1[0-2])@example[.]invalid$'
    and i.status='invited' and i.assigned_to is not null
    and i.first_invited_at is not null and i.last_outreach_at>now()-interval '3 days'
  order by s.display_name,e.id limit 1 for update of i
), changed as (
  update public.community_event_invitations i
    set first_invited_at=least(i.first_invited_at,now()-interval '73 hours'),
        last_outreach_at=now()-interval '73 hours',version=i.version+1
  from target t where i.event_id=t.event_id and i.student_id=t.student_id
  returning i.event_id,i.student_id,i.version
)
select t.display_name,t.event_name,t.assigned_to,'No response cue should now appear' as expected,
  format('UPDATE public.community_event_invitations SET first_invited_at=%L::timestamptz, last_outreach_at=%L::timestamptz, version=version+1 WHERE event_id=%L::uuid AND student_id=%L::uuid AND version=%s RETURNING student_id;',
    t.original_first,t.original_last,c.event_id,c.student_id,c.version) as restore_sql
from target t join changed c using(event_id,student_id);
commit;
