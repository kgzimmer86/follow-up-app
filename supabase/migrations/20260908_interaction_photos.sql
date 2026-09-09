begin;

alter table public.follow_up_events
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime_type text,
  add column if not exists attachment_size_bytes integer;

do $constraint$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'follow_up_events_attachment_check'
      and conrelid = 'public.follow_up_events'::regclass
  ) then
    alter table public.follow_up_events
      add constraint follow_up_events_attachment_check
      check (
        (
          attachment_path is null
          and attachment_name is null
          and attachment_mime_type is null
          and attachment_size_bytes is null
        )
        or (
          event_type = 'interaction'
          and attachment_path is not null
          and attachment_name is not null
          and attachment_mime_type in (
            'image/jpeg',
            'image/png',
            'image/heic',
            'image/heif'
          )
          and attachment_size_bytes between 1 and 8388608
        )
      );
  end if;
end
$constraint$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'follow-up-interaction-photos',
  'follow-up-interaction-photos',
  false,
  8388608,
  array[
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Approved users can upload interaction photos"
  on storage.objects;

create policy "Approved users can upload interaction photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'follow-up-interaction-photos'
  and private.is_approved_user()
  and (storage.foldername(name))[1] = 'interaction-attachments'
  and exists (
    select 1
    from public.follow_up_contacts contact
    join public.follow_up_campaigns campaign
      on campaign.id = contact.campaign_id
    where contact.id::text = (storage.foldername(name))[2]
      and campaign.status = 'active'
  )
);

drop policy if exists "Approved users can view interaction photos"
  on storage.objects;

create policy "Approved users can view interaction photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'follow-up-interaction-photos'
  and private.is_approved_user()
  and (storage.foldername(name))[1] = 'interaction-attachments'
  and exists (
    select 1
    from public.follow_up_contacts contact
    join public.follow_up_campaigns campaign
      on campaign.id = contact.campaign_id
    where contact.id::text = (storage.foldername(name))[2]
      and campaign.status = 'active'
  )
);

drop policy if exists "Approved users can delete interaction photos"
  on storage.objects;

create policy "Approved users can delete interaction photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'follow-up-interaction-photos'
  and private.is_approved_user()
  and (storage.foldername(name))[1] = 'interaction-attachments'
  and exists (
    select 1
    from public.follow_up_contacts contact
    join public.follow_up_campaigns campaign
      on campaign.id = contact.campaign_id
    where contact.id::text = (storage.foldername(name))[2]
      and campaign.status = 'active'
  )
);

create or replace function public.log_interaction_with_attachment(
  p_contact_id uuid,
  p_notes text default null,
  p_had_spiritual_conversation boolean default false,
  p_interview_completed boolean default false,
  p_kgp_shared boolean default false,
  p_received_christ boolean default false,
  p_invited_to_community_group boolean default false,
  p_status_after text default null,
  p_make_primary boolean default false,
  p_found_home boolean default false,
  p_attachment_path text default null,
  p_attachment_name text default null,
  p_attachment_mime_type text default null,
  p_attachment_size_bytes integer default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid;
  v_current_status text;
  v_event_id uuid;
begin
  v_user_id := (select auth.uid());

  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_user_id
      and is_active = true
      and role <> 'pending'
  ) then
    raise exception 'Active Follow Up access required';
  end if;

  select contact.status
  into v_current_status
  from public.follow_up_contacts contact
  join public.follow_up_campaigns campaign
    on campaign.id = contact.campaign_id
  where contact.id = p_contact_id
    and campaign.status = 'active';

  if v_current_status is null then
    raise exception 'Contact is not part of the active Follow Up campaign';
  end if;

  if p_status_after is not null
    and p_status_after not in (
      'uncontacted',
      'attempted_contact',
      'go_back',
      'involved',
      'not_interested'
    ) then
    raise exception 'Invalid Follow Up status';
  end if;

  if v_current_status = 'uncontacted'
    and (
      p_status_after is null
      or p_status_after = 'uncontacted'
    ) then
    raise exception 'Choose a new status before saving the first interaction';
  end if;

  if p_attachment_path is null
    or p_attachment_name is null
    or p_attachment_mime_type is null
    or p_attachment_size_bytes is null then
    raise exception 'A complete interaction photo attachment is required';
  end if;

  if char_length(p_attachment_name) > 255 then
    raise exception 'The photo filename is too long';
  end if;

  if p_attachment_mime_type not in (
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif'
  ) then
    raise exception 'Unsupported interaction photo type';
  end if;

  if p_attachment_size_bytes not between 1 and 8388608 then
    raise exception 'Interaction photos must be 8 MB or smaller';
  end if;

  if p_attachment_path !~ (
    '^interaction-attachments/'
    || p_contact_id::text
    || '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.(jpg|jpeg|png|heic|heif)$'
  ) then
    raise exception 'Invalid interaction photo path';
  end if;

  insert into public.follow_up_events (
    contact_id,
    performed_by,
    event_type,
    occurred_at,
    notes,
    contact_method,
    had_spiritual_conversation,
    interview_completed,
    kgp_shared,
    received_christ,
    invited_to_community_group,
    status_after,
    found_home,
    attachment_path,
    attachment_name,
    attachment_mime_type,
    attachment_size_bytes
  )
  values (
    p_contact_id,
    v_user_id,
    'interaction',
    now(),
    nullif(trim(p_notes), ''),
    'in_person',
    p_had_spiritual_conversation,
    p_interview_completed,
    p_kgp_shared or p_received_christ,
    p_received_christ,
    p_invited_to_community_group,
    p_status_after,
    p_found_home,
    p_attachment_path,
    p_attachment_name,
    p_attachment_mime_type,
    p_attachment_size_bytes
  )
  returning id into v_event_id;

  if p_make_primary then
    update public.follow_up_contacts
    set primary_owner_id = v_user_id
    where id = p_contact_id;
  end if;

  return v_event_id;
end;
$function$;

revoke all on function public.log_interaction_with_attachment(
  uuid,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  boolean,
  boolean,
  text,
  text,
  text,
  integer
) from public;

grant execute on function public.log_interaction_with_attachment(
  uuid,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  boolean,
  boolean,
  text,
  text,
  text,
  integer
) to authenticated;

notify pgrst, 'reload schema';
commit;
