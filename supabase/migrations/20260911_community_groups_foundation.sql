begin;

-- This replaces an un-applied draft. Do not silently run against an older draft schema.
do $$ begin
 if to_regclass('public.community_groups') is not null then
  raise exception 'Community tables already exist. Stop and inspect the installed version before running this migration.';
 end if;
end $$;

create table if not exists public.community_groups (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.follow_up_campaigns(id) on delete cascade,
  ministry_area_id uuid not null references public.ministry_areas(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  meeting_day text check(meeting_day in ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  revision integer not null default 1,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_group_leaders (
  group_id uuid not null references public.community_groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

create table if not exists public.community_group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.community_groups(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  started_on date not null default current_date,
  ended_on date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on)
);

create unique index if not exists community_group_one_active_membership
  on public.community_group_memberships(group_id, student_id) where ended_on is null;

create table if not exists public.community_group_meetings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.community_groups(id) on delete cascade,
  meeting_date date not null,
  version integer not null default 1,
  saved_by uuid references public.profiles(id) on delete set null,
  saved_at timestamptz not null default now(),
  unique (group_id, meeting_date)
);

create table if not exists public.community_group_attendance (
  meeting_id uuid not null references public.community_group_meetings(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  is_present boolean not null,
  recorded_at timestamptz not null default now(),
  primary key (meeting_id, student_id)
);

create or replace function private.community_area_allowed(p_profile uuid,p_campaign uuid,p_area uuid)
returns boolean language sql stable security definer set search_path='' as $$
 with recursive ancestors as (
  select id,parent_id from public.ministry_areas where id=p_area
  union select a.id,a.parent_id from public.ministry_areas a join ancestors b on a.id=b.parent_id
 )
 select exists(select 1 from public.profiles where id=p_profile and is_active and role in ('student_leader','discipler','staff','admin'))
 and (not exists(select 1 from public.profile_ministry_area_assignments where profile_id=p_profile and campaign_id=p_campaign and is_default)
 or exists(select 1 from public.profile_ministry_area_assignments a where a.profile_id=p_profile and a.campaign_id=p_campaign and a.is_default and a.ministry_area_id in(select id from ancestors)));
$$;

create or replace function public.can_access_community_group(p_group_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_groups g
    join public.profiles p on p.id = auth.uid() and p.is_active
    where g.id = p_group_id and private.community_area_allowed(p.id,g.campaign_id,g.ministry_area_id) and (
      p.role in ('staff','admin')
      or exists (select 1 from public.community_group_leaders l where l.group_id = g.id and l.profile_id = p.id)
    )
  );
$$;

alter table public.community_groups enable row level security;
alter table public.community_group_leaders enable row level security;
alter table public.community_group_memberships enable row level security;
alter table public.community_group_meetings enable row level security;
alter table public.community_group_attendance enable row level security;

create policy community_groups_read on public.community_groups for select to authenticated
  using (public.can_access_community_group(id));
create policy community_group_leaders_read on public.community_group_leaders for select to authenticated
  using (public.can_access_community_group(group_id));
create policy community_group_memberships_read on public.community_group_memberships for select to authenticated
  using (public.can_access_community_group(group_id));
create policy community_group_meetings_read on public.community_group_meetings for select to authenticated
  using (public.can_access_community_group(group_id));
create policy community_group_attendance_read on public.community_group_attendance for select to authenticated
  using (exists (select 1 from public.community_group_meetings m where m.id = meeting_id and public.can_access_community_group(m.group_id)));

create or replace function public.save_community_group_attendance(
  p_group_id uuid, p_meeting_date date, p_present_student_ids uuid[], p_roster_student_ids uuid[], p_version integer, p_revision integer
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_meeting_id uuid; g public.community_groups; campaign public.follow_up_campaigns; old_version integer; expected uuid[];
begin
  if not public.can_access_community_group(p_group_id) then raise exception 'You cannot access this Community Group.'; end if;
  select * into g from public.community_groups where id=p_group_id for update;
  select * into campaign from public.follow_up_campaigns where id=g.campaign_id for share;
  if not g.is_active or campaign.status<>'active' then raise exception 'This group is read-only.'; end if;
  if p_meeting_date is null or p_meeting_date<campaign.starts_on or p_meeting_date>least(campaign.ends_on,(now() at time zone 'America/Detroit')::date) then raise exception 'Choose a meeting date within the campaign, no later than today.'; end if;
  select id,version into v_meeting_id,old_version from public.community_group_meetings where group_id=g.id and meeting_date=p_meeting_date;
  if p_version is distinct from coalesce(old_version,0) or p_revision is distinct from g.revision then raise exception 'Attendance or the roster changed. Reload before saving.'; end if;
  select coalesce(array_agg(distinct student_id order by student_id),'{}') into expected from (
   select student_id from public.community_group_memberships where group_id=g.id and started_on<=p_meeting_date and (ended_on is null or ended_on>=p_meeting_date)
   union select student_id from public.community_group_attendance where meeting_id=v_meeting_id
  ) r;
  if expected is distinct from array(select distinct unnest(coalesce(p_roster_student_ids,'{}')) order by 1) then raise exception 'The roster changed. Reload before saving.'; end if;
  if cardinality(expected)=0 then raise exception 'Add an attender before saving.'; end if;
  if exists(select 1 from unnest(coalesce(p_present_student_ids,'{}')) x where x is null or not(x=any(expected))) then raise exception 'An attender is not on this roster.'; end if;

  insert into public.community_group_meetings(group_id, meeting_date, saved_by)
  values (p_group_id, p_meeting_date, auth.uid())
  on conflict (group_id, meeting_date) do update set saved_by = auth.uid(), saved_at = now(), version=community_group_meetings.version+1
  returning id into v_meeting_id;

  insert into public.community_group_attendance(meeting_id, student_id, is_present, recorded_at)
  select v_meeting_id, s, s = any(coalesce(p_present_student_ids, array[]::uuid[])), now()
  from unnest(expected) s
  on conflict (meeting_id, student_id) do update set is_present = excluded.is_present, recorded_at = now();

  return v_meeting_id;
end;
$$;

revoke all on function public.save_community_group_attendance(uuid,date,uuid[],uuid[],integer,integer) from public;
grant execute on function public.save_community_group_attendance(uuid,date,uuid[],uuid[],integer,integer) to authenticated;
create function private.community_require_group(p_group uuid,p_manage boolean default false)
returns public.community_groups language plpgsql security definer set search_path='' as $$
declare g public.community_groups;
begin
 select * into g from public.community_groups where id=p_group for update;
 if not found or not public.can_access_community_group(p_group) then raise exception 'This group is not available to you.'; end if;
 if p_manage and not exists(select 1 from public.profiles where id=auth.uid() and role in ('staff','admin') and is_active) then raise exception 'Staff or admin access is required.'; end if;
 perform 1 from public.follow_up_campaigns where id=g.campaign_id and status='active' for share;
 if not found or not g.is_active then raise exception 'This group is read-only.'; end if;
 return g;
end; $$;

create function public.community_save_group(p_group_id uuid,p_name text,p_area_id uuid,p_meeting_day text,p_leader_ids uuid[],p_revision integer default 0)
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
  if not private.community_area_allowed(person,c,p_area_id) then raise exception 'Each leader must be active and assigned to this area or a parent area.'; end if;
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

create function public.community_add_member(p_group_id uuid,p_student_id uuid,p_started_on date)
returns uuid language plpgsql security definer set search_path='' as $$
declare g public.community_groups; c uuid; s public.students; campaign public.follow_up_campaigns;
begin
 g:=private.community_require_group(p_group_id);
 select * into campaign from public.follow_up_campaigns where id=g.campaign_id;
 if p_started_on is null or p_started_on<campaign.starts_on or p_started_on>least(campaign.ends_on,(now() at time zone 'America/Detroit')::date) then raise exception 'Choose a start date in the active campaign, no later than today.'; end if;
 select * into s from public.students where id=p_student_id for update;
 if not found then raise exception 'Student not found.'; end if;
 insert into public.follow_up_contacts(campaign_id,student_id,phone,gender_raw,contact_origin,field_added_by,location_resolution)
 values(g.campaign_id,s.id,s.phone,s.gender_raw,'field_added',auth.uid(),'no_address') on conflict(campaign_id,student_id) do nothing;
 select id into c from public.follow_up_contacts where campaign_id=g.campaign_id and student_id=s.id for update;
 if not exists(select 1 from public.community_group_memberships where group_id=g.id and student_id=s.id and ended_on is null) then
  -- Undo an accidental same-day removal without inventing an overlapping period.
  if p_started_on=(now() at time zone 'America/Detroit')::date then
   update public.community_group_memberships set ended_on=null where id=(select id from public.community_group_memberships where group_id=g.id and student_id=s.id and ended_on=p_started_on order by started_on desc limit 1);
   if found then update public.community_groups set revision=revision+1 where id=g.id; return c; end if;
  end if;
  if exists(select 1 from public.community_group_memberships where group_id=g.id and student_id=s.id and ended_on>=p_started_on) then raise exception 'Choose a return date after the previous membership ended.'; end if;
  insert into public.community_group_memberships(group_id,student_id,started_on,created_by) values(g.id,s.id,p_started_on,auth.uid());
  update public.community_groups set revision=revision+1 where id=g.id;
 end if;
 return c;
end; $$;

create function public.community_member_action(p_group_id uuid,p_student_id uuid,p_action text,p_status text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.community_groups; c public.follow_up_contacts; others boolean; today date:=(now() at time zone 'America/Detroit')::date;
begin
 g:=private.community_require_group(p_group_id);
 select * into c from public.follow_up_contacts where campaign_id=g.campaign_id and student_id=p_student_id for update;
 if not found or not exists(select 1 from public.community_group_memberships where group_id=g.id and student_id=p_student_id and ended_on is null) then raise exception 'The student is no longer on this roster. Reload the group.'; end if;
 if p_action='involved' then perform public.set_follow_up_contact_status(c.id,'involved');
 elsif p_action='end' then
  select exists(select 1 from public.community_group_memberships m join public.community_groups x on x.id=m.group_id where m.student_id=p_student_id and m.ended_on is null and x.campaign_id=g.campaign_id and x.id<>g.id) into others;
  if c.status='involved' and not others and p_status is null then return jsonb_build_object('needs_review',true); end if;
  if p_status is not null and p_status not in ('involved','go_back','not_interested') then raise exception 'Invalid status choice.'; end if;
  update public.community_group_memberships set ended_on=greatest(started_on,today) where group_id=g.id and student_id=p_student_id and ended_on is null;
  if c.status='involved' and not others and p_status is not null then perform public.set_follow_up_contact_status(c.id,p_status); end if;
  update public.community_groups set revision=revision+1 where id=g.id;
 else raise exception 'Invalid action.'; end if;
 return jsonb_build_object('needs_review',false);
end; $$;

-- Called by the existing merge audit insert, before the duplicate student is deleted.
create function private.community_on_contact_merge() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kept_student_id=new.merged_student_id then return new; end if;
 update public.community_groups set revision=revision+1 where id in(select group_id from public.community_group_memberships where student_id in(new.kept_student_id,new.merged_student_id));
 update public.community_group_memberships source set ended_on=greatest(source.started_on,(now() at time zone 'America/Detroit')::date)
 where source.student_id=new.merged_student_id and source.ended_on is null and exists(select 1 from public.community_group_memberships target where target.student_id=new.kept_student_id and target.group_id=source.group_id and target.ended_on is null);
 update public.community_group_memberships set student_id=new.kept_student_id where student_id=new.merged_student_id;
 insert into public.community_group_attendance(meeting_id,student_id,is_present) select meeting_id,new.kept_student_id,is_present from public.community_group_attendance where student_id=new.merged_student_id
 on conflict(meeting_id,student_id) do update set is_present=community_group_attendance.is_present or excluded.is_present;
 delete from public.community_group_attendance where student_id=new.merged_student_id;
 return new;
end; $$;
create trigger community_transfer_on_merge after insert on public.follow_up_contact_merge_log for each row execute function private.community_on_contact_merge();

revoke all on public.community_groups,public.community_group_leaders,public.community_group_memberships,public.community_group_meetings,public.community_group_attendance from anon,authenticated;
grant select on public.community_groups,public.community_group_leaders,public.community_group_memberships,public.community_group_meetings,public.community_group_attendance to authenticated;
revoke all on function private.community_area_allowed(uuid,uuid,uuid),private.community_require_group(uuid,boolean),private.community_on_contact_merge() from public,anon,authenticated;
revoke all on function public.can_access_community_group(uuid),public.community_save_group(uuid,text,uuid,text,uuid[],integer),public.community_add_member(uuid,uuid,date),public.community_member_action(uuid,uuid,text,text) from public,anon;
grant execute on function public.can_access_community_group(uuid),public.community_save_group(uuid,text,uuid,text,uuid[],integer),public.community_add_member(uuid,uuid,date),public.community_member_action(uuid,uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
