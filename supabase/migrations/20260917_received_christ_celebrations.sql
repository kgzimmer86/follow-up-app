-- Test first. Private first-name feed plus one cursor per approved account.
begin;
create table private.received_christ_celebrations (
  id bigint generated always as identity primary key,
  student_id uuid not null unique references public.students(id) on delete cascade,
  event_id uuid not null unique references public.follow_up_events(id) on delete cascade,
  first_name text not null,
  created_at timestamptz not null default now()
);
create table private.celebration_cursors (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen bigint not null default 0
);
alter table private.received_christ_celebrations enable row level security;
alter table private.celebration_cursors enable row level security;
revoke all on private.received_christ_celebrations,private.celebration_cursors from public,anon,authenticated;

create function private.record_received_christ_celebration() returns trigger
language plpgsql security definer set search_path='' as $$
declare student uuid; first_name text;
begin
  if new.received_christ is not true then
    delete from private.received_christ_celebrations where event_id=new.id;
    return new;
  end if;
  if tg_op='UPDATE' and old.received_christ is true then return new; end if;
  if new.event_type::text<>'interaction' or not exists(select 1 from public.profiles
    where id=new.performed_by and is_active and role<>'pending') then return new; end if;
  -- Serialize rare celebrations before allocating feed IDs: cursor ordering
  -- cannot skip a celebration that commits later with an earlier ID.
  perform pg_advisory_xact_lock(724901713);
  select c.student_id,split_part(btrim(s.display_name),' ',1) into student,first_name
    from public.follow_up_contacts c join public.students s on s.id=c.student_id
    join public.follow_up_campaigns campaign on campaign.id=c.campaign_id
    where c.id=new.contact_id and campaign.status='active';
  if student is null then return new; end if;
  -- Rechecking the box on a later interaction must not announce it again.
  if exists(select 1 from public.follow_up_events e
    join public.follow_up_contacts c on c.id=e.contact_id
    where c.student_id=student and e.id<>new.id and e.received_christ is true) then return new; end if;
  insert into private.received_christ_celebrations(student_id,event_id,first_name)
    values(student,new.id,coalesce(nullif(first_name,''),'A student')) on conflict do nothing;
  return new;
end; $$;
create trigger received_christ_celebration after insert or update of received_christ
  on public.follow_up_events for each row execute function private.record_received_christ_celebration();
revoke all on function private.record_received_christ_celebration() from public,anon,authenticated;

-- Atomically reserves the next unseen celebration for this account, preventing
-- duplicate playback across tabs/devices. No query is awaited during app startup.
create function public.take_received_christ_celebration() returns jsonb
language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); cursor_id bigint; item private.received_christ_celebrations;
begin
  if not exists(select 1 from public.profiles where id=viewer and is_active and role<>'pending') then
    raise exception 'Active Follow Up access required';
  end if;
  insert into private.celebration_cursors(profile_id) values(viewer) on conflict do nothing;
  select last_seen into cursor_id from private.celebration_cursors where profile_id=viewer for update;
  select * into item from private.received_christ_celebrations where id>cursor_id order by id limit 1;
  if not found then return null; end if;
  update private.celebration_cursors set last_seen=item.id where profile_id=viewer;
  return jsonb_build_object('id',item.id::text,'firstName',item.first_name);
end; $$;
revoke all on function public.take_received_christ_celebration() from public,anon;
grant execute on function public.take_received_christ_celebration() to authenticated;
commit;
