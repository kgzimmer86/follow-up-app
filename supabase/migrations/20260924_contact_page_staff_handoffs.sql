-- Contact-page-only assignment extension. Existing bulk and self-claim RPCs stay intact.
-- Run the whole file before deploying the contact-page UI. No contact rows are changed.
begin;

do $$
begin
  if to_regprocedure('public.get_contact_primary_choices(uuid)') is null
     or to_regprocedure('public.assign_contacts_to_follow_up_user(uuid[],uuid)') is null
     or to_regprocedure('public.claim_follow_up_contact(uuid)') is null then
    raise exception 'STOP: existing assignment functions are required';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_contact_page_primary_choices', 'assign_contact_page_primary')
      and obj_description(p.oid, 'pg_proc') is distinct from 'contact-page-staff-handoffs-v1'
  ) then
    raise exception 'STOP: unexpected contact-page assignment function already exists';
  end if;
end;
$$;

create or replace function public.get_contact_page_primary_choices(p_contact_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  campaign uuid;
  choices jsonb := '[]'::jsonb;
  staff_choices jsonb;
begin
  select p.role::text into actor_role from public.profiles p
    where p.id = actor and p.is_active = true;
  if actor_role is null or actor_role not in ('student_leader','discipler','staff','admin') then
    raise exception 'Assignment access required';
  end if;
  select c.id into campaign from public.follow_up_campaigns c
    where c.status = 'active' order by c.created_at desc limit 1;
  if not exists (select 1 from public.follow_up_contacts c
    where c.id = p_contact_id and c.campaign_id = campaign and c.status <> 'not_interested') then
    return '[]'::jsonb;
  end if;
  -- Preserve the existing eligible-direct-disciple choices and staff/admin behavior.
  if actor_role <> 'student_leader' then
    choices := public.get_contact_primary_choices(p_contact_id);
  end if;
  if actor_role in ('staff','admin') then return choices; end if;
  -- Approved users can read contacts movement-wide under the audited SELECT policy.
  -- Handoff is allowed to active staff/admin, not to other students or disciplers.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'display_name', coalesce(nullif(btrim(p.display_name),''), p.email, 'Follow Up leader'),
    'group', 'staff') order by p.display_name, p.id), '[]'::jsonb)
    into staff_choices from public.profiles p
    where p.is_active = true and p.role in ('staff','admin') and p.id <> actor
      and not exists (select 1 from jsonb_array_elements(choices) c where c->>'id' = p.id::text);
  return choices || staff_choices;
end;
$$;
comment on function public.get_contact_page_primary_choices(uuid) is 'contact-page-staff-handoffs-v1';

create or replace function public.assign_contact_page_primary(p_contact_id uuid, p_assignee_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  actor_role text;
  target_role text;
  choices jsonb;
begin
  -- Serialize contact changes, and prevent deactivation during the authorization check.
  select p.role::text into actor_role from public.profiles p
    where p.id = actor and p.is_active = true for share;
  if actor_role is null or actor_role not in ('student_leader','discipler','staff','admin') then
    raise exception 'Assignment access required';
  end if;
  if p_contact_id is null or p_assignee_id is null then
    raise exception 'Choose a contact and assignee';
  end if;
  perform 1 from public.follow_up_contacts c where c.id = p_contact_id for update;
  if not found then raise exception 'Contact unavailable'; end if;
  if p_assignee_id = actor then
    perform public.claim_follow_up_contact(p_contact_id);
    return;
  end if;
  select p.role::text into target_role from public.profiles p
    where p.id = p_assignee_id and p.is_active = true for share;
  if target_role is null or target_role not in ('student_leader','discipler','staff','admin') then
    raise exception 'Choose an active assignee';
  end if;
  choices := public.get_contact_page_primary_choices(p_contact_id);
  if not exists (select 1 from jsonb_array_elements(choices) c where c->>'id' = p_assignee_id::text) then
    raise exception 'This assignee is not available for this contact';
  end if;
  if actor_role in ('student_leader','discipler') and target_role in ('staff','admin') then
    -- Only ownership changes. Existing assignment metadata triggers still run.
    update public.follow_up_contacts set primary_owner_id = p_assignee_id where id = p_contact_id;
  else
    -- Recheck the existing area/ownership rules; do not broaden the bulk RPC.
    perform public.assign_contacts_to_follow_up_user(array[p_contact_id], p_assignee_id);
  end if;
end;
$$;
comment on function public.assign_contact_page_primary(uuid,uuid) is 'contact-page-staff-handoffs-v1';

revoke all on function public.get_contact_page_primary_choices(uuid) from public, anon;
revoke all on function public.assign_contact_page_primary(uuid,uuid) from public, anon;
grant execute on function public.get_contact_page_primary_choices(uuid) to authenticated;
grant execute on function public.assign_contact_page_primary(uuid,uuid) to authenticated;
commit;

-- Read-only installation verification: both columns must be true.
select to_regprocedure('public.get_contact_page_primary_choices(uuid)') is not null as choices_installed,
       to_regprocedure('public.assign_contact_page_primary(uuid,uuid)') is not null as assignment_installed;
