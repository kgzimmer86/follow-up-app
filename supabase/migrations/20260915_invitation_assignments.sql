-- Review and install in testing first. Extends invitations, not contact ownership.
begin;
alter table public.community_event_invitations
  add column assigned_to uuid references public.profiles(id) on delete set null,
  add column assigned_by uuid references public.profiles(id) on delete set null,
  add column assigned_at timestamptz,
  add column first_invited_at timestamptz,
  add column last_outreach_at timestamptz,
  add column last_outreach_by uuid references public.profiles(id) on delete set null;
-- Existing responses prove an invitation happened; exact outreach dates were not
-- previously stored. Do not invent an assignee or generate retroactive reminder work.
update public.community_event_invitations set first_invited_at=updated_at,last_outreach_at=updated_at
  where status<>'not_asked';
create index community_invitation_assignee on public.community_event_invitations(assigned_to,event_id)
  where assigned_to is not null;
create index community_invitation_initial_pending on public.community_event_invitations(assigned_to,event_id)
  where first_invited_at is null and status='not_asked';

create table public.community_invitation_outreach (
  id uuid primary key,
  event_id uuid not null references public.community_events(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  recorded_by uuid references public.profiles(id) on delete set null,
  method text not null check(method in ('text','interaction','response')),
  occurred_at timestamptz not null default now(),
  follow_up_event_id uuid references public.follow_up_events(id) on delete set null
);
create index community_invitation_outreach_student on public.community_invitation_outreach(student_id,event_id);

create function private.invitation_user_role() returns text language plpgsql stable security definer set search_path='' as $$
declare r text;
begin
  select role::text into r from public.profiles where id=auth.uid() and is_active
    and role in ('staff','admin','discipler','student_leader');
  if r is null then raise exception 'Active Follow Up access is required.'; end if;
  return r;
end; $$;

-- Follow Up contact logging already permits approved users to act on campaign contacts.
-- This widens invitation access beyond group rosters, not contact-table permissions.
create or replace function public.can_access_community_invitation(p_event uuid,p_student uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.can_access_community_event(p_event) and exists(
    select 1 from public.community_events e join public.follow_up_contacts c on c.campaign_id=e.campaign_id
    where e.id=p_event and c.student_id=p_student);
$$;
alter table public.community_invitation_outreach enable row level security;
create policy community_invitation_outreach_read on public.community_invitation_outreach for select to authenticated
  using(public.can_access_community_invitation(event_id,student_id));
revoke all on public.community_invitation_outreach from anon,authenticated;
grant select on public.community_invitation_outreach to authenticated;

create function private.invitation_open_event(p_event uuid) returns public.community_events
language plpgsql security definer set search_path='' as $$
declare e public.community_events;
begin
  perform private.invitation_user_role();
  select * into e from public.community_events where id=p_event for share;
  if not found then raise exception 'Event not available.'; end if;
  perform 1 from public.follow_up_campaigns where id=e.campaign_id and status='active' for share;
  if not found or not e.is_open or e.event_date<(now() at time zone 'America/Detroit')::date then
    raise exception 'This event is closed or has already passed.';
  end if;
  return e;
end; $$;

create function public.community_assign_invitations(p_event uuid,p_contacts uuid[],p_assignee uuid,p_versions jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare e public.community_events; r text; recipient_role text; contact record; old public.community_event_invitations; n integer:=0;
begin
  r:=private.invitation_user_role(); e:=private.invitation_open_event(p_event);
  select role::text into recipient_role from public.profiles where id=p_assignee and is_active
    and role in ('staff','admin','discipler','student_leader') for share;
  if recipient_role is null then raise exception 'Choose an active recipient.'; end if;
  if r='student_leader' and p_assignee is distinct from auth.uid() then raise exception 'Student leaders may claim invitations only for themselves.'; end if;
  if r='discipler' and recipient_role not in ('student_leader','discipler') then raise exception 'Disciplers may assign to student leaders or disciplers.'; end if;
  if coalesce(cardinality(p_contacts),0) not between 1 and 100 or array_position(p_contacts,null) is not null
    or (select count(distinct x) from unnest(p_contacts) x)<>cardinality(p_contacts) then
    raise exception 'Choose 1–100 distinct contacts.';
  end if;
  if (select count(*) from public.follow_up_contacts where id=any(p_contacts) and campaign_id=e.campaign_id)<>cardinality(p_contacts) then
    raise exception 'All contacts must belong to this campaign.';
  end if;
  -- A stable student lock order also serializes claims from different groups.
  for contact in select c.id,c.student_id from public.follow_up_contacts c
    where c.id=any(p_contacts) and c.campaign_id=e.campaign_id order by c.student_id for update loop
    perform 1 from public.students where id=contact.student_id for update;
    select * into old from public.community_event_invitations where event_id=e.id and student_id=contact.student_id for update;
    if coalesce(old.version,0) is distinct from (p_versions->>contact.id::text)::integer then
      raise exception 'An invitation changed. Reload and review the assignment again.';
    end if;
    if old.first_invited_at is not null or coalesce(old.status,'not_asked')<>'not_asked' then
      raise exception 'This student has already been invited. No initial invitation needs assignment.';
    end if;
    if old.assigned_to is not null and r not in ('staff','admin') then
      raise exception 'This invitation is already assigned. Only staff/admins can reassign it.';
    end if;
    insert into public.community_event_invitations(event_id,student_id,status,assigned_to,assigned_by,assigned_at)
      values(e.id,contact.student_id,'not_asked',p_assignee,auth.uid(),now())
      on conflict(event_id,student_id) do update set assigned_to=excluded.assigned_to,assigned_by=excluded.assigned_by,
        assigned_at=excluded.assigned_at,version=community_event_invitations.version+1;
    n:=n+1;
  end loop;
  if n<>cardinality(p_contacts) then raise exception 'Contacts changed. Reload and review again.'; end if;
  return n;
end; $$;

create function private.apply_invitation_outreach(p_event uuid,p_student uuid,p_response text,p_submission uuid,p_method text,p_history uuid)
returns void language plpgsql security definer set search_path='' as $$
declare old public.community_event_invitations; response text;
begin
  if p_response is not null and p_response not in ('invited','maybe','coming','cant_come') then raise exception 'Choose a valid response.'; end if;
  select * into old from public.community_event_invitations where event_id=p_event and student_id=p_student for update;
  response:=coalesce(p_response,nullif(old.status,'not_asked'),'invited');
  insert into public.community_invitation_outreach(id,event_id,student_id,recorded_by,method,follow_up_event_id)
    values(p_submission,p_event,p_student,auth.uid(),p_method,p_history);
  insert into public.community_event_invitations(event_id,student_id,status,assigned_to,assigned_by,assigned_at,first_invited_at,last_outreach_at,last_outreach_by,updated_by)
    values(p_event,p_student,response,auth.uid(),auth.uid(),now(),now(),now(),auth.uid(),auth.uid())
    on conflict(event_id,student_id) do update set status=response,
      assigned_to=coalesce(community_event_invitations.assigned_to,auth.uid()),
      assigned_by=case when community_event_invitations.assigned_to is null then auth.uid() else community_event_invitations.assigned_by end,
      assigned_at=coalesce(community_event_invitations.assigned_at,now()),
      first_invited_at=coalesce(community_event_invitations.first_invited_at,now()),
      last_outreach_at=now(),last_outreach_by=auth.uid(),updated_at=now(),updated_by=auth.uid(),version=community_event_invitations.version+1;
end; $$;

create function public.community_log_outreach(p_submission uuid,p_event uuid,p_contact uuid,p_response text,p_method text,p_payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.community_events; c public.follow_up_contacts; old public.community_invitation_outreach; history_id uuid; notes text; text_result jsonb;
begin
  perform private.invitation_user_role();
  if p_submission is null then raise exception 'A submission identifier is required.'; end if;
  -- Serialize retries without moving the reminder clock a second time.
  perform pg_advisory_xact_lock(hashtextextended(p_submission::text,0));
  select * into old from public.community_invitation_outreach where id=p_submission;
  if found then
    if old.recorded_by is distinct from auth.uid() or old.event_id is distinct from p_event or old.method is distinct from p_method
      or not exists(select 1 from public.follow_up_contacts where id=p_contact and student_id=old.student_id) then
      raise exception 'This submission identifier is already in use.';
    end if;
    return old.follow_up_event_id;
  end if;
  e:=private.invitation_open_event(p_event);
  select * into c from public.follow_up_contacts where id=p_contact and campaign_id=e.campaign_id for update;
  if not found then raise exception 'Contact is not in this event campaign.'; end if;
  perform 1 from public.students where id=c.student_id for update;
  notes:=concat_ws(E'\n',nullif(btrim(p_payload->>'p_notes'),''),'Event invitation/reminder: '||e.name);
  if p_method='text' then
    text_result:=public.log_text_attempt(p_submission,c.id,
      array(select distinct x from jsonb_array_elements_text(coalesce(p_payload->'p_purposes','[]'::jsonb)) x union select 'invite_event'),
      left(e.name,100),p_payload->>'p_notes');
    history_id:=(text_result->>'event_id')::uuid;
  elsif p_method='interaction' then
    if nullif(p_payload->>'p_attachment_path','') is not null then
      history_id:=public.log_interaction_with_attachment(c.id,notes,
        coalesce((p_payload->>'p_had_spiritual_conversation')::boolean,false),coalesce((p_payload->>'p_interview_completed')::boolean,false),
        coalesce((p_payload->>'p_kgp_shared')::boolean,false),coalesce((p_payload->>'p_received_christ')::boolean,false),
        coalesce((p_payload->>'p_invited_to_community_group')::boolean,false),p_payload->>'p_status_after',
        coalesce((p_payload->>'p_make_primary')::boolean,false),coalesce((p_payload->>'p_found_home')::boolean,false),
        p_payload->>'p_attachment_path',p_payload->>'p_attachment_name',p_payload->>'p_attachment_mime_type',(p_payload->>'p_attachment_size_bytes')::integer);
    else
      history_id:=public.log_interaction(c.id,notes,
        coalesce((p_payload->>'p_had_spiritual_conversation')::boolean,false),coalesce((p_payload->>'p_interview_completed')::boolean,false),
        coalesce((p_payload->>'p_kgp_shared')::boolean,false),coalesce((p_payload->>'p_received_christ')::boolean,false),
        coalesce((p_payload->>'p_invited_to_community_group')::boolean,false),p_payload->>'p_status_after',
        coalesce((p_payload->>'p_make_primary')::boolean,false),coalesce((p_payload->>'p_found_home')::boolean,false));
    end if;
  else raise exception 'Choose text or interaction logging.';
  end if;
  perform private.apply_invitation_outreach(e.id,c.student_id,p_response,p_submission,p_method,history_id);
  return history_id;
end; $$;

create function public.community_invite_counts() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare initial_count bigint; reminder_count bigint;
begin
  perform private.invitation_user_role();
  select count(*) filter(where i.first_invited_at is null and i.status='not_asked'),
    count(*) filter(where i.status='invited' and i.last_outreach_at<=now()-interval '3 days')
    into initial_count,reminder_count
    from public.community_event_invitations i join public.community_events e on e.id=i.event_id
    join public.follow_up_campaigns c on c.id=e.campaign_id and c.status='active'
    where i.assigned_to=auth.uid() and e.is_open and e.event_date>=(now() at time zone 'America/Detroit')::date;
  return jsonb_build_object('initial',initial_count,'reminders',reminder_count);
end; $$;

create function public.community_invitation_workspace(p_event uuid default null,p_mine boolean default false,p_query text default '',p_area uuid default null,p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.invitation_user_role();
  if p_page is null or p_page<1 then raise exception 'Invalid page.'; end if;
  with recursive areas as (
    select id from public.ministry_areas where id=p_area
    union select a.id from public.ministry_areas a join areas b on a.parent_id=b.id
  ), base as (
    select c.id contact_id,c.student_id,s.display_name,c.phone,c.status contact_status,c.primary_owner_id,
      e.id event_id,e.name event_name,e.event_date,e.is_open,cp.status campaign_status,
      coalesce(i.status,'not_asked') response,coalesce(i.version,0) version,i.assigned_to,p.display_name assignee_name,
      i.first_invited_at,i.last_outreach_at,
      case when cp.status<>'active' or not e.is_open or e.event_date<(now() at time zone 'America/Detroit')::date then 'history'
        when i.first_invited_at is null and coalesce(i.status,'not_asked')='not_asked' then 'initial'
        when i.status='invited' and i.last_outreach_at<=now()-interval '3 days' then 'no_response' else 'handled' end cue
    from public.community_events e join public.follow_up_campaigns cp on cp.id=e.campaign_id
    join public.follow_up_contacts c on c.campaign_id=e.campaign_id join public.students s on s.id=c.student_id
    left join public.community_event_invitations i on i.event_id=e.id and i.student_id=s.id
    left join public.profiles p on p.id=i.assigned_to
    where cp.status in ('active','archived') and (p_event is null or e.id=p_event)
      and (not p_mine or i.assigned_to=auth.uid())
      and (p_mine or p_event is not null)
      and (p_area is null or c.ministry_location_id in(select id from areas))
      and (coalesce(p_query,'')='' or s.display_name ilike '%'||p_query||'%' or s.uniqname ilike '%'||p_query||'%')
  ), paged as (
    select * from base order by case cue when 'initial' then 0 when 'no_response' then 1 when 'handled' then 2 else 3 end,event_date,display_name,contact_id,event_id
      limit 50 offset (p_page-1)*50
  ) select jsonb_build_object('total',(select count(*) from base),'rows',coalesce(jsonb_agg(to_jsonb(paged)),'[]'::jsonb)) into result from paged;
  return result;
end; $$;

-- Existing group response controls retain their access boundary and stale-save check.
create or replace function public.community_set_invitation(p_group_id uuid,p_event_id uuid,p_student_id uuid,p_status text,p_version integer)
returns integer language plpgsql security definer set search_path='' as $$
declare g public.community_groups; e public.community_events; old public.community_event_invitations; v integer;
begin
  g:=private.community_require_group(p_group_id); e:=private.invitation_open_event(p_event_id);
  if e.campaign_id<>g.campaign_id then raise exception 'This event is not available for this campaign.'; end if;
  perform 1 from public.students where id=p_student_id for update;
  if not found or not exists(select 1 from public.community_group_memberships where group_id=g.id and student_id=p_student_id and ended_on is null) then
    raise exception 'This student is no longer on the group roster.';
  end if;
  select * into old from public.community_event_invitations where event_id=e.id and student_id=p_student_id for update;
  if coalesce(old.version,0) is distinct from p_version then raise exception 'This invitation changed. Reload before saving.'; end if;
  if p_status is null or p_status not in ('not_asked','invited','maybe','coming','cant_come') then raise exception 'Choose a valid invitation response.'; end if;
  if p_status='not_asked' then
    if old.first_invited_at is not null then raise exception 'An invitation already happened. Record a reminder instead of resetting it.'; end if;
    return coalesce(old.version,0);
  end if;
  if old.first_invited_at is null then
    perform private.apply_invitation_outreach(e.id,p_student_id,p_status,gen_random_uuid(),'response',null);
  else
    update public.community_event_invitations set status=p_status,updated_at=now(),updated_by=auth.uid(),version=version+1
      where event_id=e.id and student_id=p_student_id;
  end if;
  select version into v from public.community_event_invitations where event_id=e.id and student_id=p_student_id;
  return v;
end; $$;

create function public.community_invitation_response(p_event uuid,p_contact uuid,p_status text,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare e public.community_events; s uuid; old public.community_event_invitations;
begin
  e:=private.invitation_open_event(p_event);
  select student_id into s from public.follow_up_contacts where id=p_contact and campaign_id=e.campaign_id;
  if not found then raise exception 'Contact not available for this event.'; end if;
  perform 1 from public.students where id=s for update;
  select * into old from public.community_event_invitations where event_id=e.id and student_id=s for update;
  if coalesce(old.version,0) is distinct from p_version then raise exception 'This invitation changed. Reload before saving.'; end if;
  if p_status is null or p_status not in ('invited','maybe','coming','cant_come') then raise exception 'Choose a valid response.'; end if;
  if old.first_invited_at is null then
    perform private.apply_invitation_outreach(e.id,s,p_status,gen_random_uuid(),'response',null);
  else
    update public.community_event_invitations set status=p_status,version=version+1,updated_at=now(),updated_by=auth.uid() where event_id=e.id and student_id=s;
  end if;
end; $$;

-- Extend the existing invitation merge hook; keep target assignment if present.
create or replace function private.community_invitations_on_merge() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.kept_student_id=new.merged_student_id then return new; end if;
  insert into public.community_event_invitations(event_id,student_id,status,version,updated_by,updated_at,assigned_to,assigned_by,assigned_at,first_invited_at,last_outreach_at,last_outreach_by)
    select event_id,new.kept_student_id,status,version+1,updated_by,updated_at,assigned_to,assigned_by,assigned_at,first_invited_at,last_outreach_at,last_outreach_by
    from public.community_event_invitations where student_id=new.merged_student_id
    on conflict(event_id,student_id) do update set
      status=case when excluded.status='not_asked' and community_event_invitations.first_invited_at is not null then community_event_invitations.status
        when community_event_invitations.status='not_asked' and excluded.first_invited_at is not null then excluded.status
        when excluded.updated_at>community_event_invitations.updated_at then excluded.status else community_event_invitations.status end,
      updated_by=case when excluded.updated_at>community_event_invitations.updated_at then excluded.updated_by else community_event_invitations.updated_by end,
      updated_at=greatest(excluded.updated_at,community_event_invitations.updated_at),version=greatest(excluded.version,community_event_invitations.version)+1,
      assigned_to=coalesce(community_event_invitations.assigned_to,excluded.assigned_to),
      assigned_by=case when community_event_invitations.assigned_to is null then excluded.assigned_by else community_event_invitations.assigned_by end,
      assigned_at=coalesce(community_event_invitations.assigned_at,excluded.assigned_at),
      first_invited_at=least(community_event_invitations.first_invited_at,excluded.first_invited_at),
      last_outreach_at=greatest(community_event_invitations.last_outreach_at,excluded.last_outreach_at),
      last_outreach_by=case when excluded.last_outreach_at>community_event_invitations.last_outreach_at or community_event_invitations.last_outreach_at is null then excluded.last_outreach_by else community_event_invitations.last_outreach_by end;
  update public.community_invitation_outreach set student_id=new.kept_student_id where student_id=new.merged_student_id;
  delete from public.community_event_invitations where student_id=new.merged_student_id;
  return new;
end; $$;

revoke all on function private.invitation_user_role(),private.invitation_open_event(uuid),private.apply_invitation_outreach(uuid,uuid,text,uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.community_assign_invitations(uuid,uuid[],uuid,jsonb),public.community_log_outreach(uuid,uuid,uuid,text,text,jsonb),public.community_invite_counts(),public.community_invitation_workspace(uuid,boolean,text,uuid,integer),public.community_invitation_response(uuid,uuid,text,integer) from public,anon;
grant execute on function public.community_assign_invitations(uuid,uuid[],uuid,jsonb),public.community_log_outreach(uuid,uuid,uuid,text,text,jsonb),public.community_invite_counts(),public.community_invitation_workspace(uuid,boolean,text,uuid,integer),public.community_invitation_response(uuid,uuid,text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
