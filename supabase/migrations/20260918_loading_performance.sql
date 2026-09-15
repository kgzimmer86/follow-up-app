-- Additive read optimizations. No tables, data, policies, or write functions change.
-- Run the complete file in one SQL Editor execution. Failure rolls it all back.
begin;

-- Derive the bounded reader from the INSTALLED assignment rules, rather than
-- replacing production permissions with an older copy from the repository.
do $migration$
declare
  definition text;
  header text := 'CREATE OR REPLACE FUNCTION public.get_contact_assignment_workspace()';
  contact_filter text := E'where c.campaign_id = v_campaign_id\n      and c.status <> ''not_interested''';
  entry_point text := E'begin\n  if v_user_id is null then';
begin
  select pg_get_functiondef('public.get_contact_assignment_workspace()'::regprocedure) into definition;
  if length(definition) - length(replace(definition, header, '')) <> length(header)
     or length(definition) - length(replace(definition, contact_filter, '')) <> length(contact_filter)
     or length(definition) - length(replace(definition, entry_point, '')) <> length(entry_point) then
    raise exception 'Assignment reader differs from the verified shape. No changes applied; inspect its definition first.';
  end if;
  definition := replace(definition, header,
    'CREATE OR REPLACE FUNCTION public.get_contact_assignment_page(p_contact_ids uuid[])');
  definition := replace(definition, entry_point,
    E'begin\n  if p_contact_ids is null or cardinality(p_contact_ids) > 50 then\n    raise exception ''Provide at most 50 contact IDs'';\n  end if;\n  if v_user_id is null then');
  definition := replace(definition, contact_filter,
    contact_filter || E'\n      and c.id = any(p_contact_ids)');
  execute definition;
end;
$migration$;
revoke all on function public.get_contact_assignment_page(uuid[]) from public, anon;
grant execute on function public.get_contact_assignment_page(uuid[]) to authenticated;

-- SECURITY INVOKER intentionally retains the exact table RLS used by the old
-- individual reads. Counts include former attenders, but Involved is current roster.
create or replace function public.get_community_group_summaries(p_group_ids uuid[])
returns table(group_id uuid, latest_meeting_date date, involved bigint,
  attended bigint, ever_attended bigint, needs_attention bigint)
language plpgsql stable security invoker set search_path = '' as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid()
      and p.is_active and p.role::text <> 'pending'
  ) then raise exception 'Active approved account required'; end if;
  if p_group_ids is null or cardinality(p_group_ids) > 100 then
    raise exception 'Provide at most 100 group IDs';
  end if;
  return query
    select g.id, latest.meeting_date,
      (select count(*) from public.follow_up_contacts c
        where c.campaign_id = g.campaign_id and c.status = 'involved'
          and exists (select 1 from public.community_group_memberships m
            where m.group_id = g.id and m.student_id = c.student_id and m.ended_on is null)),
      (select count(*) from public.community_group_attendance a
        where a.meeting_id = latest.id and a.is_present),
      (select count(distinct a.student_id) from public.community_group_attendance a
        join public.community_group_meetings m on m.id = a.meeting_id
        where m.group_id = g.id and a.is_present),
      case when g.is_active and year.status = 'active'
        then (select count(*) from public.community_group_checkin_attention(g.id))
        else 0::bigint end
    from public.community_groups g
    join public.follow_up_campaigns year on year.id = g.campaign_id
    left join lateral (
      select m.id, m.meeting_date from public.community_group_meetings m
      where m.group_id = g.id order by m.meeting_date desc limit 1
    ) latest on true
    where g.id = any(p_group_ids)
    order by g.id;
end;
$function$;
revoke all on function public.get_community_group_summaries(uuid[]) from public, anon;
grant execute on function public.get_community_group_summaries(uuid[]) to authenticated;

notify pgrst, 'reload schema';
commit;
