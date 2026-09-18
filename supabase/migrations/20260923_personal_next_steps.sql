-- Personal plans only. No AI configuration or student data. Run the whole file.
-- Requires the installed Community interaction-return adapter and photo logger.
-- Transactional. A second application stops without changing the installed schema.
begin;
do $$ begin
  if to_regclass('public.follow_up_next_steps') is not null then
    raise exception 'Next Steps already exists. Verify the installed version; do not replay this migration.';
  end if;
  if to_regprocedure('private.invitation_user_role()') is null
    or to_regprocedure('private.is_approved_user()') is null
    or to_regprocedure('private.community_log_interaction(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean)') is null
    or to_regprocedure('public.log_interaction_with_attachment(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean,text,text,text,integer)') is null
    or to_regprocedure('public.community_log_outreach(uuid,uuid,uuid,text,text,jsonb)') is null
    or to_regclass('public.follow_up_contact_merge_log') is null then
    raise exception 'Required interaction, invitation, photo or merge definitions are missing. No changes applied.';
  end if;
  if (select prorettype from pg_proc where oid=to_regprocedure('private.community_log_interaction(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean)')) <> 'uuid'::regtype then
    raise exception 'Expected a UUID-returning interaction adapter. Inspect before continuing.';
  end if;
end $$;

create table public.follow_up_next_steps (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id),
  contact_id uuid not null references public.follow_up_contacts(id),
  action text not null check (char_length(btrim(action)) between 1 and 500),
  due_at timestamptz not null check (isfinite(due_at)),
  status text not null default 'pending' check (status in ('pending','completed','cleared')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  completion_submission uuid unique,
  interaction_id uuid references public.follow_up_events(id) on delete set null,
  check ((status='completed' and completed_at is not null and completion_submission is not null)
    or (status<>'completed' and completed_at is null and completion_submission is null and interaction_id is null))
);
create index follow_up_next_steps_pending on public.follow_up_next_steps(owner_id,due_at,id) where status='pending';
create index follow_up_next_steps_contact on public.follow_up_next_steps(contact_id);
alter table public.follow_up_next_steps enable row level security;
revoke all on public.follow_up_next_steps from public,anon,authenticated;
grant select on public.follow_up_next_steps to authenticated;
create policy next_steps_owner_read on public.follow_up_next_steps for select to authenticated using (
  owner_id=auth.uid() and private.is_approved_user() and exists (
    select 1 from public.follow_up_contacts c join public.follow_up_campaigns f on f.id=c.campaign_id
    where c.id=contact_id and f.status::text='active'
  )
);

-- Match existing Follow Up interaction scope: approved users, active campaign
-- contacts. A plan belongs to its author, never to another leader by inference.
create function public.follow_up_next_steps_list(p_contact uuid default null,p_after_due timestamptz default null,p_after_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform private.invitation_user_role();
  if (p_after_due is null) <> (p_after_id is null) then raise exception 'Invalid page cursor.'; end if;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.due_at,r.id),'[]'::jsonb) into result from (
    select n.id,n.contact_id,n.action,n.due_at,n.version,s.display_name,c.status as contact_status,
      coalesce(c.primary_owner_id=auth.uid(),false) as is_primary
    from public.follow_up_next_steps n
    join public.follow_up_contacts c on c.id=n.contact_id
    join public.follow_up_campaigns f on f.id=c.campaign_id and f.status::text='active'
    join public.students s on s.id=c.student_id
    where n.owner_id=auth.uid() and n.status='pending' and (p_contact is null or n.contact_id=p_contact)
      and (p_after_due is null or (n.due_at,n.id)>(p_after_due,p_after_id))
    order by n.due_at,n.id limit 51
  ) r;
  return result;
end $$;

create function public.follow_up_next_step_save(p_id uuid,p_contact uuid,p_action text,p_due timestamptz,p_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare existing public.follow_up_next_steps;
begin
  perform private.invitation_user_role();
  if p_id is null or p_contact is null or p_version is null or p_version<0 then raise exception 'Invalid next step.'; end if;
  -- Contact locking serializes create checks, and follows the merge lock order.
  perform 1 from public.follow_up_contacts c join public.follow_up_campaigns f on f.id=c.campaign_id
    where c.id=p_contact and f.status::text='active' for update of c;
  if not found then raise exception 'Contact is not in an active campaign.'; end if;
  select * into existing from public.follow_up_next_steps where id=p_id for update;
  if found then
    if existing.owner_id is distinct from auth.uid() or existing.contact_id is distinct from p_contact then
      raise exception 'This next step is unavailable.';
    end if;
    if existing.status<>'pending' then raise exception 'This step is no longer pending. Refresh the list.'; end if;
    -- Retrying an identical create or update after a lost response is harmless.
    if existing.version=p_version+1 and existing.action=btrim(p_action) and existing.due_at=p_due then return existing.id; end if;
    if existing.version<>p_version then raise exception 'This step changed. Refresh before editing it.'; end if;
  elsif p_version<>0 then raise exception 'This step is unavailable. Refresh the list.';
  end if;
  if p_action is null or char_length(btrim(p_action)) not between 1 and 500 then raise exception 'Write a next step between 1 and 500 characters.'; end if;
  if p_due is null or not isfinite(p_due) or p_due<=now() or p_due>now()+interval '366 days' then
    raise exception 'Choose a future time within the next year.';
  end if;
  if existing.id is null then
    if exists(select 1 from public.follow_up_next_steps where owner_id=auth.uid() and contact_id=p_contact and status='pending') then
      raise exception 'You already have a pending step for this contact. Edit that step instead.';
    end if;
    insert into public.follow_up_next_steps(id,owner_id,contact_id,action,due_at)
      values(p_id,auth.uid(),p_contact,btrim(p_action),p_due);
  else
    update public.follow_up_next_steps set action=btrim(p_action),due_at=p_due,version=version+1,updated_at=now() where id=p_id;
  end if;
  return p_id;
end $$;

create function public.follow_up_next_step_clear(p_id uuid,p_version integer)
returns void language plpgsql security definer set search_path='' as $$
declare n public.follow_up_next_steps;
begin
  perform private.invitation_user_role();
  select * into n from public.follow_up_next_steps where id=p_id and owner_id=auth.uid() for update;
  if not found then raise exception 'This next step is unavailable.'; end if;
  if n.status='cleared' then return; end if;
  if n.status<>'pending' or p_version is null or n.version<>p_version then raise exception 'This step changed. Refresh before clearing it.'; end if;
  update public.follow_up_next_steps set status='cleared',version=version+1,updated_at=now() where id=p_id;
end $$;

-- Log and complete in one transaction. The existing loggers remain responsible
-- for status, progress, photo validation, invitations and ownership changes.
create function public.follow_up_next_step_record(p_id uuid,p_version integer,p_submission uuid,p_payload jsonb,p_event uuid default null,p_response text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare n public.follow_up_next_steps; history_id uuid; contact uuid;
begin
  perform private.invitation_user_role();
  if p_submission is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid interaction submission.'; end if;
  select contact_id into contact from public.follow_up_next_steps where id=p_id and owner_id=auth.uid();
  if contact is null then raise exception 'This next step is unavailable.'; end if;
  perform 1 from public.follow_up_contacts c join public.follow_up_campaigns f on f.id=c.campaign_id
    where c.id=contact and f.status::text='active' for update of c;
  if not found then raise exception 'Contact is not in an active campaign.'; end if;
  select * into n from public.follow_up_next_steps where id=p_id and owner_id=auth.uid() for update;
  if n.contact_id is distinct from contact then raise exception 'Contact changed. Refresh the list.'; end if;
  if n.status='completed' and n.completion_submission=p_submission then return n.interaction_id; end if;
  if n.status<>'pending' or p_version is null or n.version<>p_version then raise exception 'This step changed. Refresh before recording the interaction.'; end if;
  if p_payload->>'p_contact_id' is distinct from n.contact_id::text then raise exception 'Interaction contact does not match this step.'; end if;
  if char_length(coalesce(p_payload->>'p_notes',''))>20000 then raise exception 'Interaction notes are too long.'; end if;
  if p_event is not null then
    history_id:=public.community_log_outreach(p_submission,p_event,n.contact_id,p_response,'interaction',p_payload);
  elsif nullif(p_payload->>'p_attachment_path','') is not null then
    history_id:=public.log_interaction_with_attachment(n.contact_id,p_payload->>'p_notes',
      coalesce((p_payload->>'p_had_spiritual_conversation')::boolean,false),coalesce((p_payload->>'p_interview_completed')::boolean,false),
      coalesce((p_payload->>'p_kgp_shared')::boolean,false),coalesce((p_payload->>'p_received_christ')::boolean,false),
      coalesce((p_payload->>'p_invited_to_community_group')::boolean,false),p_payload->>'p_status_after',
      coalesce((p_payload->>'p_make_primary')::boolean,false),coalesce((p_payload->>'p_found_home')::boolean,false),
      p_payload->>'p_attachment_path',p_payload->>'p_attachment_name',p_payload->>'p_attachment_mime_type',(p_payload->>'p_attachment_size_bytes')::integer);
  else
    history_id:=private.community_log_interaction(n.contact_id,p_payload->>'p_notes',
      coalesce((p_payload->>'p_had_spiritual_conversation')::boolean,false),coalesce((p_payload->>'p_interview_completed')::boolean,false),
      coalesce((p_payload->>'p_kgp_shared')::boolean,false),coalesce((p_payload->>'p_received_christ')::boolean,false),
      coalesce((p_payload->>'p_invited_to_community_group')::boolean,false),p_payload->>'p_status_after',
      coalesce((p_payload->>'p_make_primary')::boolean,false),coalesce((p_payload->>'p_found_home')::boolean,false));
  end if;
  if history_id is null or not exists(select 1 from public.follow_up_events where id=history_id and contact_id=n.contact_id and performed_by=auth.uid() and event_type='interaction') then
    raise exception 'Could not confirm the saved interaction. No changes applied.';
  end if;
  update public.follow_up_next_steps set status='completed',completed_at=now(),updated_at=now(),
    interaction_id=history_id,completion_submission=p_submission,version=version+1 where id=n.id;
  return history_id;
end $$;

create function public.follow_up_next_step_due_count()
returns integer language plpgsql security definer set search_path='' as $$
begin
  perform private.invitation_user_role();
  return (select count(*)::integer from public.follow_up_next_steps n
    join public.follow_up_contacts c on c.id=n.contact_id
    join public.follow_up_campaigns f on f.id=c.campaign_id and f.status::text='active'
    where n.owner_id=auth.uid() and n.status='pending' and n.due_at<=now());
end $$;

-- The existing reviewed merge audit is inserted before deletion. Preserve both
-- intentions even when the same owner has a pending step on each duplicate.
create function private.next_steps_on_contact_merge() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.follow_up_next_steps set contact_id=new.kept_contact_id,version=version+1,updated_at=now()
    where contact_id=new.merged_contact_id;
  return new;
end $$;
create trigger next_steps_transfer_on_merge after insert on public.follow_up_contact_merge_log
  for each row execute function private.next_steps_on_contact_merge();

revoke all on function private.next_steps_on_contact_merge() from public,anon,authenticated;
revoke all on function public.follow_up_next_steps_list(uuid,timestamptz,uuid),
  public.follow_up_next_step_save(uuid,uuid,text,timestamptz,integer),public.follow_up_next_step_clear(uuid,integer),
  public.follow_up_next_step_record(uuid,integer,uuid,jsonb,uuid,text),public.follow_up_next_step_due_count() from public,anon;
grant execute on function public.follow_up_next_steps_list(uuid,timestamptz,uuid),
  public.follow_up_next_step_save(uuid,uuid,text,timestamptz,integer),public.follow_up_next_step_clear(uuid,integer),
  public.follow_up_next_step_record(uuid,integer,uuid,jsonb,uuid,text),public.follow_up_next_step_due_count() to authenticated;
notify pgrst,'reload schema';
commit;
