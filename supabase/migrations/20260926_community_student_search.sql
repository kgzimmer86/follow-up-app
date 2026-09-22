-- Apply as a complete file before deploying the Community search UI.
-- Additive, read-only search; no contact or membership data changes.
begin;
do $$
begin
  if to_regprocedure('public.can_access_community_group(uuid)') is null
    or to_regclass('public.follow_up_contact_affinities') is null then
    raise exception 'Required Community/affinity baseline is missing. Stop.';
  end if;
end $$;

create or replace function public.community_search_students(p_group_id uuid, p_search text)
returns table(id uuid, display_name text, uniqname text, umich_email text, dorm text)
language plpgsql stable security definer set search_path = '' as $$
declare
  campaign uuid;
  term text := lower(btrim(coalesce(p_search, '')));
begin
  if not coalesce(public.can_access_community_group(p_group_id), false) then
    raise exception 'This group is not available to you.';
  end if;
  select g.campaign_id into campaign
  from public.community_groups g
  join public.follow_up_campaigns c on c.id = g.campaign_id and c.status = 'active'
  where g.id = p_group_id and g.is_active;
  if not found then raise exception 'This group is read-only.'; end if;
  if length(term) < 2 or length(term) > 200 then
    raise exception 'Enter between 2 and 200 characters.';
  end if;

  return query
  with recursive assigned as (
    -- Only current/default assignments count, not historical assignments or
    -- the searching staff member's own area. Co-leaders' areas are combined.
    select distinct a.id, a.parent_id, a.area_type
    from public.community_group_leaders l
    join public.profiles p on p.id = l.profile_id and p.is_active
      and p.role in ('student_leader','discipler','staff','admin')
    join public.profile_ministry_area_assignments x on x.profile_id = p.id
      and x.campaign_id = campaign and x.is_default
    join public.ministry_areas a on a.id = x.ministry_area_id and a.is_active
    where l.group_id = p_group_id
  ), direct_areas(area_id) as (
    select a.id from assigned a where a.area_type <> 'affinity'
    union
    select a.id from public.ministry_areas a join direct_areas d on a.parent_id = d.area_id
    where a.is_active
  ), broader_areas(area_id) as (
    select a.parent_id from assigned a where a.area_type <> 'affinity' and a.parent_id is not null
    union
    select a.id from public.ministry_areas a join broader_areas b on a.parent_id = b.area_id
    where a.is_active
  ), matches as (
    select s.id, s.display_name, s.uniqname, s.umich_email,
      coalesce(nullif(a.name, ''), nullif(btrim(c.raw_location_text), '')) as dorm,
      case
        when c.ministry_location_id in (select area_id from direct_areas)
          or exists (
            select 1 from public.follow_up_contact_affinities f
            join assigned x on x.id = f.ministry_area_id and x.area_type = 'affinity'
            where f.contact_id = c.id
          ) then 0
        when c.ministry_location_id in (select area_id from broader_areas) then 1
        else 2
      end as priority
    from public.students s
    left join public.follow_up_contacts c on c.student_id = s.id and c.campaign_id = campaign
    left join public.ministry_areas a on a.id = c.ministry_location_id
    where strpos(lower(coalesce(s.display_name, '')), term) > 0
       or strpos(lower(coalesce(s.uniqname, '')), term) > 0
       or strpos(lower(coalesce(s.umich_email, '')), term) > 0
  )
  select m.id, m.display_name, m.uniqname, m.umich_email, m.dorm
  from matches m
  order by m.priority, lower(m.display_name), m.id
  limit 30;
end $$;

revoke all on function public.community_search_students(uuid,text) from public, anon;
grant execute on function public.community_search_students(uuid,text) to authenticated;
commit;

-- Expected: true, true.
select to_regprocedure('public.community_search_students(uuid,text)') is not null as search_exists,
  has_function_privilege('authenticated','public.community_search_students(uuid,text)','EXECUTE')
  and not has_function_privilege('anon','public.community_search_students(uuid,text)','EXECUTE')
  as search_permissions_correct;
