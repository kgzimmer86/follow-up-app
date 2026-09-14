begin;
create function public.community_workspace_counts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare invitations jsonb; attention bigint;
begin
  invitations := public.community_invite_counts();
  select count(*) into attention from (
    select g.id,m.student_id,min(m.started_on) as started_on
    from public.community_groups g
    join public.follow_up_campaigns c on c.id=g.campaign_id and c.status='active'
    join public.community_group_memberships m on m.group_id=g.id and m.ended_on is null
    where g.is_active and public.can_access_community_group(g.id)
    group by g.id,m.student_id
  ) member
  cross join lateral (
    select count(*) as meetings, count(*) filter(where a.is_present=false) as absences
    from (select meeting.id from public.community_group_meetings meeting
      where meeting.group_id=member.id and meeting.meeting_date>=member.started_on
      order by meeting.meeting_date desc limit 2) recent
    left join public.community_group_attendance a on a.meeting_id=recent.id and a.student_id=member.student_id
  ) streak where streak.meetings=2 and streak.absences=2;
  return invitations || jsonb_build_object('groups',attention);
end; $$;
revoke all on function public.community_workspace_counts() from public,anon;
grant execute on function public.community_workspace_counts() to authenticated;
commit;
