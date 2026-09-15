-- Opt-in devices only. Does not enable scheduling or send notifications.
begin;

do $$ begin
  if to_regprocedure('private.my_contact_attention_rows()') is null
    or to_regprocedure('private.invitation_user_role()') is null
    or to_regprocedure('private.community_checkin_attention(uuid)') is null then
    raise exception 'Existing personal contact and Community attention functions are required. No changes applied.';
  end if;
end $$;

create table if not exists private.follow_up_push_devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  last_fingerprint text,
  next_check_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  failures integer not null default 0,
  created_at timestamptz not null default now()
);
alter table private.follow_up_push_devices enable row level security;
revoke all on private.follow_up_push_devices from public, anon, authenticated;
create index if not exists follow_up_push_due on private.follow_up_push_devices(next_check_at);
create index if not exists follow_up_push_owner on private.follow_up_push_devices(profile_id);

create or replace function public.follow_up_push_register(p_endpoint text,p_p256dh text,p_auth text)
returns uuid language plpgsql security definer set search_path='' as $$
declare device uuid;
begin
  perform private.invitation_user_role();
  -- Serialize the per-account limit, including concurrent device registrations.
  perform 1 from public.profiles where id=auth.uid() for update;
  if length(p_endpoint)>2048 or p_endpoint is null or
     p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-zA-Z0-9-]+\.push\.apple\.com|[a-zA-Z0-9.-]+\.notify\.windows\.com)/[^[:space:]#]+$'
     or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}=?$'
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}(==)?$' then
    raise exception 'Invalid browser push subscription.';
  end if;
  select id into device from private.follow_up_push_devices where endpoint=p_endpoint and profile_id=auth.uid();
  if device is not null then return device; end if;
  if exists(select 1 from private.follow_up_push_devices where endpoint=p_endpoint) then
    raise exception 'This device must unsubscribe before switching accounts.';
  end if;
  if (select count(*) from private.follow_up_push_devices where profile_id=auth.uid())>=10 then
    raise exception 'Notification device limit reached. Turn off notifications on an unused device first.';
  end if;
  insert into private.follow_up_push_devices(profile_id,endpoint,p256dh,auth_key)
    values(auth.uid(),p_endpoint,p_p256dh,p_auth) returning id into device;
  return device;
end; $$;

create or replace function public.follow_up_push_remove(p_endpoint text)
returns void language sql security definer set search_path='' as $$
  delete from private.follow_up_push_devices where endpoint=p_endpoint and profile_id=auth.uid();
$$;

create or replace function public.follow_up_push_device(p_endpoint text)
returns uuid language plpgsql security definer set search_path='' as $$
begin
  perform private.invitation_user_role();
  return (select id from private.follow_up_push_devices where endpoint=p_endpoint and profile_id=auth.uid());
end; $$;

-- Reuse the existing contact and group attention helpers. Keep item identities
-- only in this transaction; store a fingerprint, send only category counts.
create or replace function private.follow_up_push_snapshot()
returns jsonb language plpgsql security definer set search_path='' as $$
declare contacts jsonb; invitations jsonb; groups jsonb;
begin
  perform private.invitation_user_role();
  select coalesce(jsonb_agg(a.contact_id order by a.contact_id),'[]'::jsonb) into contacts
    from private.my_contact_attention_rows() a where a.unattempted or a.stale_go_back or a.new_believer;
  select coalesce(jsonb_agg(jsonb_build_array(i.event_id,i.student_id) order by i.event_id,i.student_id),'[]'::jsonb)
    into invitations from public.community_event_invitations i
    join public.community_events e on e.id=i.event_id
    join public.follow_up_campaigns c on c.id=e.campaign_id and c.status='active'
    where i.assigned_to=auth.uid() and i.first_invited_at is null and i.status='not_asked'
      and e.is_open and e.event_date>=(now() at time zone 'America/Detroit')::date;
  select coalesce(jsonb_agg(jsonb_build_array(a.group_id,a.student_id) order by a.group_id,a.student_id),'[]'::jsonb)
    into groups from public.community_group_leaders l
    cross join lateral private.community_checkin_attention(l.group_id) a where l.profile_id=auth.uid();
  return jsonb_build_object('contacts',jsonb_array_length(contacts),'invitations',jsonb_array_length(invitations),
    'groups',jsonb_array_length(groups),'total',jsonb_array_length(contacts)+jsonb_array_length(invitations)+jsonb_array_length(groups),
    'fingerprint',md5(jsonb_build_array(contacts,invitations,groups)::text));
end; $$;

-- This wrapper is PRIVATE, never callable by an authenticated client. Restore
-- the caller's transaction-local identity on both success and exception.
create or replace function private.follow_up_push_snapshot_for(p_profile uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous_sub text:=current_setting('request.jwt.claim.sub',true); snapshot jsonb;
begin
  perform set_config('request.jwt.claim.sub',p_profile::text,true);
  snapshot:=private.follow_up_push_snapshot();
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  return snapshot;
exception when others then
  perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
  raise;
end; $$;

create or replace function public.follow_up_push_claim()
returns jsonb language plpgsql security definer set search_path='' as $$
declare d record; snapshot jsonb; token uuid; jobs jsonb:='[]'::jsonb;
  snapshots jsonb:='{}'::jsonb;
begin
  for d in select * from private.follow_up_push_devices
    where next_check_at<=now() and (lease_until is null or lease_until<now())
    order by next_check_at,id limit 50 for update skip locked
  loop
    if not exists(select 1 from public.profiles p where p.id=d.profile_id and p.is_active
      and p.role in ('admin','staff','discipler','student_leader')) then
      delete from private.follow_up_push_devices where id=d.id;
      continue;
    end if;
    snapshot:=snapshots->d.profile_id::text;
    if snapshot is null then
      snapshot:=private.follow_up_push_snapshot_for(d.profile_id);
      snapshots:=snapshots || jsonb_build_object(d.profile_id::text,snapshot);
    end if;
    if d.last_fingerprint is not distinct from snapshot->>'fingerprint' then
      update private.follow_up_push_devices set next_check_at=now()+interval '5 minutes',failures=0,
        lease_id=null,lease_until=null where id=d.id;
      continue;
    end if;
    token:=gen_random_uuid();
    update private.follow_up_push_devices set lease_id=token,lease_until=now()+interval '2 minutes' where id=d.id;
    jobs:=jobs || jsonb_build_array(jsonb_build_object('id',d.id,'lease',token,'endpoint',d.endpoint,
      'p256dh',d.p256dh,'auth',d.auth_key,'snapshot',snapshot,'sentAt',floor(extract(epoch from clock_timestamp())*1000)));
  end loop;
  return jobs;
end; $$;

create or replace function public.follow_up_push_finish(p_id uuid,p_lease uuid,p_fingerprint text,p_result text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_result='expired' then
    delete from private.follow_up_push_devices where id=p_id and lease_id=p_lease;
  elsif p_result in ('sent','retry') then
    update private.follow_up_push_devices set
      last_fingerprint=case when p_result='sent' then p_fingerprint else last_fingerprint end,
      failures=case when p_result='sent' then 0 else least(failures+1,10) end,
      next_check_at=now()+case when p_result='sent' then interval '5 minutes'
        else least(60,power(2,least(failures,6))::integer)*interval '1 minute' end,
      lease_id=null,lease_until=null where id=p_id and lease_id=p_lease;
  else raise exception 'Invalid delivery result.';
  end if;
end; $$;

revoke all on function private.follow_up_push_snapshot(),private.follow_up_push_snapshot_for(uuid) from public,anon,authenticated,service_role;
revoke all on function public.follow_up_push_register(text,text,text),public.follow_up_push_remove(text),public.follow_up_push_device(text) from public,anon;
grant execute on function public.follow_up_push_register(text,text,text),public.follow_up_push_remove(text),public.follow_up_push_device(text) to authenticated;
revoke all on function public.follow_up_push_claim(),public.follow_up_push_finish(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.follow_up_push_claim(),public.follow_up_push_finish(uuid,uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
