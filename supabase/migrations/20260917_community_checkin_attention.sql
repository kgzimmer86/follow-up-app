begin;
create function private.community_checkin_attention(p_group uuid default null)
returns table(group_id uuid,student_id uuid)
language sql stable security definer set search_path='' as $$
  select member.group_id,member.student_id from (
    select g.id as group_id,m.student_id,min(m.started_on) as started_on,c.id as contact_id
    from public.community_groups g
    join public.follow_up_campaigns year on year.id=g.campaign_id and year.status='active'
    join public.community_group_memberships m on m.group_id=g.id and m.ended_on is null
    join public.follow_up_contacts c on c.student_id=m.student_id and c.campaign_id=g.campaign_id
    where g.is_active and (p_group is null or g.id=p_group)
      and c.status<>'not_interested' and public.can_access_community_group(g.id)
    group by g.id,m.student_id,c.id
  ) member
  left join lateral (
    select max(e.occurred_at) as checked_in from public.follow_up_events e
    where e.contact_id=member.contact_id and e.event_type::text='interaction'
      and e.invited_to_community_group=true
  ) outreach on true
  cross join lateral (
    select count(*) as meetings,count(*) filter(where a.is_present=false) as absences
    from (select m.id from public.community_group_meetings m
      where m.group_id=member.group_id and m.meeting_date>=member.started_on
        and (outreach.checked_in is null or m.meeting_date>(outreach.checked_in at time zone 'America/Detroit')::date)
      order by m.meeting_date desc limit 2) recent
    left join public.community_group_attendance a on a.meeting_id=recent.id and a.student_id=member.student_id
  ) streak where streak.meetings=2 and streak.absences=2;
$$;
revoke all on function private.community_checkin_attention(uuid) from public,anon,authenticated;
create function public.community_group_checkin_attention(p_group uuid)
returns table(student_id uuid) language plpgsql stable security definer set search_path='' as $$
begin
  perform private.invitation_user_role();
  if not public.can_access_community_group(p_group) then raise exception 'Group access required.'; end if;
  return query select a.student_id from private.community_checkin_attention(p_group) a;
end; $$;
revoke all on function public.community_group_checkin_attention(uuid) from public,anon;
grant execute on function public.community_group_checkin_attention(uuid) to authenticated;
create or replace function public.community_workspace_counts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare invitations jsonb; attention bigint;
begin
  invitations:=public.community_invite_counts();
  select count(*) into attention from private.community_checkin_attention();
  return invitations || jsonb_build_object('groups',attention);
end; $$;
commit;
