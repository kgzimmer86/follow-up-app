-- Campaign-wide events and shared student responses. Review/install before app release.
begin;
do $$ begin
  if to_regclass('public.community_events') is not null or to_regclass('public.community_event_invitations') is not null then
    raise exception 'Community event tables already exist. Stop and inspect the installed version.';
  end if;
end $$;

create table public.community_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.follow_up_campaigns(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  event_date date not null,
  location text not null default '' check (char_length(location) <= 240),
  details text not null default '' check (char_length(details) <= 2000),
  is_open boolean not null default true,
  revision integer not null default 1,
  created_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index community_events_campaign_date on public.community_events(campaign_id,event_date,id);
create table public.community_event_invitations (
  event_id uuid not null references public.community_events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  status text not null check (status in ('not_asked','invited','maybe','coming','cant_come')),
  version integer not null default 1,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(event_id,student_id)
);

create function public.can_access_community_event(p_event uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.community_events e
    join public.follow_up_campaigns c on c.id=e.campaign_id and c.status in ('active','archived')
    join public.profiles p on p.id=auth.uid() and p.is_active
      and p.role in ('staff','admin','student_leader','discipler')
    where e.id=p_event);
$$;
create function public.can_access_community_invitation(p_event uuid,p_student uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.can_access_community_event(p_event) and exists (
    select 1 from public.community_events e
    join public.community_groups g on g.campaign_id=e.campaign_id
    join public.community_group_memberships m on m.group_id=g.id and m.student_id=p_student
    where e.id=p_event and public.can_access_community_group(g.id)
  );
$$;
alter table public.community_events enable row level security;
alter table public.community_event_invitations enable row level security;
create policy community_events_read on public.community_events for select to authenticated
  using(public.can_access_community_event(id));
create policy community_event_invitations_read on public.community_event_invitations for select to authenticated
  using(public.can_access_community_invitation(event_id,student_id));

create function public.community_save_event(
  p_campaign_id uuid,p_event_id uuid,p_name text,p_event_date date,
  p_location text,p_details text,p_is_open boolean,p_revision integer
) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.follow_up_campaigns; e public.community_events;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and is_active and role in ('staff','admin')) then
    raise exception 'Staff or admin access is required.';
  end if;
  select * into c from public.follow_up_campaigns where id=p_campaign_id and status='active' for share;
  if not found then raise exception 'This campaign is read-only.'; end if;
  if p_event_date is null or p_event_date<c.starts_on or p_event_date>c.ends_on then
    raise exception 'Choose an event date within this academic year.';
  end if;
  if nullif(btrim(p_name),'') is null or char_length(btrim(p_name))>120
    or char_length(coalesce(p_location,''))>240 or char_length(coalesce(p_details,''))>2000 or p_is_open is null then
    raise exception 'Check the event name, location, and details.';
  end if;
  if p_event_id is null then
    if p_revision is distinct from 0 then raise exception 'Reload before creating this event.'; end if;
    insert into public.community_events(campaign_id,name,event_date,location,details,is_open,created_by)
      values(c.id,btrim(p_name),p_event_date,btrim(coalesce(p_location,'')),btrim(coalesce(p_details,'')),p_is_open,auth.uid()) returning id into p_event_id;
  else
    select * into e from public.community_events where id=p_event_id and campaign_id=c.id for update;
    if not found then raise exception 'This event is not available.'; end if;
    if e.revision is distinct from p_revision then raise exception 'This event changed. Reload before saving.'; end if;
    update public.community_events set name=btrim(p_name),event_date=p_event_date,
      location=btrim(coalesce(p_location,'')),details=btrim(coalesce(p_details,'')),is_open=p_is_open,
      revision=revision+1,updated_at=now() where id=e.id;
  end if;
  return p_event_id;
end;
$$;

create function public.community_set_invitation(
  p_group_id uuid,p_event_id uuid,p_student_id uuid,p_status text,p_version integer
) returns integer language plpgsql security definer set search_path='' as $$
declare g public.community_groups; e public.community_events; existing public.community_event_invitations; next_version integer;
begin
  g:=private.community_require_group(p_group_id);
  select * into e from public.community_events where id=p_event_id and campaign_id=g.campaign_id for share;
  if not found then raise exception 'This event is not available for this campaign.'; end if;
  if not e.is_open then raise exception 'Invitation tracking is closed for this event.'; end if;
  if p_status is null or p_status not in ('not_asked','invited','maybe','coming','cant_come') then
    raise exception 'Choose a valid invitation response.';
  end if;
  -- Serialize edits across different groups and coordinate with student merges.
  perform 1 from public.students where id=p_student_id for update;
  if not found or not exists(select 1 from public.community_group_memberships
    where group_id=g.id and student_id=p_student_id and ended_on is null) then
    raise exception 'This student is no longer on the group roster.';
  end if;
  select * into existing from public.community_event_invitations
    where event_id=e.id and student_id=p_student_id for update;
  if coalesce(existing.version,0) is distinct from p_version then
    raise exception 'This invitation changed, possibly in another group. Reload before saving.';
  end if;
  insert into public.community_event_invitations(event_id,student_id,status,updated_by)
    values(e.id,p_student_id,p_status,auth.uid())
    on conflict(event_id,student_id) do update set status=excluded.status,
      version=community_event_invitations.version+1,updated_by=excluded.updated_by,updated_at=now()
    returning version into next_version;
  return next_version;
end;
$$;

-- Preserve event responses during existing Follow Up/import duplicate merges.
-- Most recently edited response wins; ties retain the kept student's response.
create function private.community_invitations_on_merge()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.kept_student_id=new.merged_student_id then return new; end if;
  insert into public.community_event_invitations(event_id,student_id,status,version,updated_by,updated_at)
    select event_id,new.kept_student_id,status,version+1,updated_by,updated_at
    from public.community_event_invitations where student_id=new.merged_student_id
    on conflict(event_id,student_id) do update set
      status=case when excluded.updated_at>community_event_invitations.updated_at then excluded.status else community_event_invitations.status end,
      updated_by=case when excluded.updated_at>community_event_invitations.updated_at then excluded.updated_by else community_event_invitations.updated_by end,
      updated_at=greatest(excluded.updated_at,community_event_invitations.updated_at),
      version=greatest(excluded.version,community_event_invitations.version)+1;
  delete from public.community_event_invitations where student_id=new.merged_student_id;
  return new;
end;
$$;
create trigger community_transfer_invitations_on_merge after insert on public.follow_up_contact_merge_log
  for each row execute function private.community_invitations_on_merge();

revoke all on public.community_events,public.community_event_invitations from anon,authenticated;
grant select on public.community_events,public.community_event_invitations to authenticated;
revoke all on function public.can_access_community_event(uuid),public.can_access_community_invitation(uuid,uuid),
  public.community_save_event(uuid,uuid,text,date,text,text,boolean,integer),
  public.community_set_invitation(uuid,uuid,uuid,text,integer) from public,anon;
grant execute on function public.can_access_community_event(uuid),public.can_access_community_invitation(uuid,uuid),
  public.community_save_event(uuid,uuid,text,date,text,text,boolean,integer),
  public.community_set_invitation(uuid,uuid,uuid,text,integer) to authenticated;
revoke all on function private.community_invitations_on_merge() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
