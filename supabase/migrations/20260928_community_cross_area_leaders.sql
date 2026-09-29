-- Apply to the intended project only after verifying the foundation migration exists.
begin;

do $$ begin
  if to_regprocedure('private.community_require_group(uuid,boolean)') is null
     or to_regclass('public.community_group_leaders') is null then
    raise exception 'Community group foundation is missing; stop.';
  end if;
end $$;

-- A selected leader needs access even when their assigned campus differs.
create or replace function public.can_access_community_group(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.community_groups g
    join public.profiles p on p.id = auth.uid() and p.is_active
    where g.id = p_group_id and (
      (p.role in ('staff', 'admin') and private.community_area_allowed(p.id, g.campaign_id, g.ministry_area_id))
      or (p.role in ('student_leader', 'discipler', 'staff', 'admin') and exists (
        select 1 from public.community_group_leaders l where l.group_id = g.id and l.profile_id = p.id
      ))
    )
  );
$$;

create or replace function public.community_save_group(p_group_id uuid,p_name text,p_area_id uuid,p_meeting_day text,p_leader_ids uuid[],p_revision integer default 0)
returns uuid language plpgsql security definer set search_path='' as $$
declare g public.community_groups; c uuid; person uuid;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role in ('staff','admin')) then raise exception 'Staff or admin access is required.'; end if;
 if p_group_id is not null then
  g:=private.community_require_group(p_group_id,true);
  if g.revision is distinct from p_revision then raise exception 'This group changed. Reload before saving.'; end if;
 end if;
 select id into c from public.follow_up_campaigns where status='active' for share;
 if c is null then raise exception 'There is no active campaign.'; end if;
 if not private.community_area_allowed(auth.uid(),c,p_area_id) or not exists(select 1 from public.ministry_areas where id=p_area_id and is_active) then raise exception 'Choose an area within your oversight.'; end if;
 if nullif(btrim(p_name),'') is null or char_length(btrim(p_name))>120 then raise exception 'Enter a group name of 1–120 characters.'; end if;
 if cardinality(coalesce(p_leader_ids,'{}'))=0 then raise exception 'Choose at least one leader.'; end if;
 foreach person in array p_leader_ids loop
  if not exists (
    select 1 from public.profiles p where p.id=person and p.is_active
      and p.role in ('student_leader','discipler','staff','admin')
      and exists (select 1 from public.profile_ministry_area_assignments a where a.profile_id=p.id and a.campaign_id=c and a.is_default)
  ) then raise exception 'Each leader must be active and assigned to a campus area.'; end if;
 end loop;
 if p_group_id is null then
  insert into public.community_groups(campaign_id,ministry_area_id,name,meeting_day,created_by) values(c,p_area_id,btrim(p_name),nullif(p_meeting_day,''),auth.uid()) returning * into g;
 else
  update public.community_groups set name=btrim(p_name),ministry_area_id=p_area_id,meeting_day=nullif(p_meeting_day,''),revision=revision+1,updated_at=now() where id=g.id;
 end if;
 delete from public.community_group_leaders where group_id=g.id;
 insert into public.community_group_leaders(group_id,profile_id) select g.id,unnest(p_leader_ids) on conflict do nothing;
 return g.id;
end; $$;

create or replace function public.community_manage_group_leaders(
  p_group_id uuid, p_leader_ids uuid[], p_revision integer
) returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.community_groups;
begin
  g := private.community_require_group(p_group_id, true);
  if g.revision is distinct from p_revision then
    raise exception 'This group changed. Reload before saving.';
  end if;
  if cardinality(coalesce(p_leader_ids, '{}'::uuid[])) = 0 then
    raise exception 'Choose at least one leader.';
  end if;
  if exists (
    select 1 from unnest(p_leader_ids) id
    where id is null or not exists (
      select 1 from public.profiles p
      where p.id = id and p.is_active
        and p.role in ('student_leader', 'discipler', 'staff', 'admin')
        and exists (
          select 1 from public.profile_ministry_area_assignments a
          where a.profile_id = p.id and a.campaign_id = g.campaign_id and a.is_default
        )
    )
  ) then
    raise exception 'Every leader must be active and assigned to a campus area.';
  end if;
  delete from public.community_group_leaders where group_id = g.id;
  insert into public.community_group_leaders(group_id, profile_id)
    select g.id, id from (select distinct unnest(p_leader_ids) id) leaders;
  update public.community_groups set revision = revision + 1, updated_at = now() where id = g.id;
end;
$$;

revoke all on function public.community_manage_group_leaders(uuid,uuid[],integer) from public, anon;
grant execute on function public.community_manage_group_leaders(uuid,uuid[],integer) to authenticated;
commit;

-- Read-only verification: function exists and only authenticated can execute it.
select has_function_privilege('authenticated', 'public.community_manage_group_leaders(uuid,uuid[],integer)', 'execute') as authenticated_can_execute,
       has_function_privilege('anon', 'public.community_manage_group_leaders(uuid,uuid[],integer)', 'execute') as anon_can_execute;
