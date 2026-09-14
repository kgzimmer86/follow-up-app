-- Recipient dropdown choices only; existing assignment and contact permissions are unchanged.
begin;
create or replace function public.community_invitation_recipients(p_campaign uuid)
returns table(id uuid, display_name text)
language plpgsql stable security definer set search_path='' as $$
declare viewer uuid := auth.uid(); viewer_role text; default_area uuid;
begin
  viewer_role := private.invitation_user_role();
  if not exists(select 1 from public.follow_up_campaigns c where c.id=p_campaign and c.status='active') then
    return;
  end if;
  select ministry_area_id into default_area from public.profile_ministry_area_assignments
    where profile_id=viewer and campaign_id=p_campaign and is_default=true;
  return query
  with recursive area_tree as (
    select a.id from public.ministry_areas a where a.id=default_area
    union
    select a.id from public.ministry_areas a join area_tree t on a.parent_id=t.id
  ), disciples as (
    select r.disciple_id from public.discipleship_relationships r
      where r.discipler_id=viewer and r.campaign_id=p_campaign and r.is_current and r.ended_at is null
    union
    select r.disciple_id from public.discipleship_relationships r
      join disciples d on r.discipler_id=d.disciple_id
      where r.campaign_id=p_campaign and r.is_current and r.ended_at is null
  )
  select p.id, p.display_name::text from public.profiles p
  where p.is_active and p.role in ('staff','admin','discipler','student_leader')
    and (viewer_role in ('staff','admin') or p.role in ('discipler','student_leader'))
    and (viewer_role<>'student_leader' or p.id=viewer)
    and (p.id=viewer or default_area is null
      or exists(select 1 from disciples d where d.disciple_id=p.id)
      or exists(select 1 from public.profile_ministry_area_assignments a
        where a.profile_id=p.id and a.campaign_id=p_campaign and a.is_default
          and a.ministry_area_id in(select t.id from area_tree t)))
  order by p.display_name, p.id;
end; $$;
revoke all on function public.community_invitation_recipients(uuid) from public,anon;
grant execute on function public.community_invitation_recipients(uuid) to authenticated;
commit;
