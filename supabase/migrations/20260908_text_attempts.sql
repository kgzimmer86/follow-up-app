-- Text attempts: run this complete file in Supabase SQL Editor before deploying.
-- Adds a separate history type; preserves existing knock/interaction routines.
-- No student records are deleted or rewritten.
begin;

alter table public.follow_up_events
  add column if not exists text_purposes text[],
  add column if not exists text_event_name text;

alter table public.follow_up_events
  drop constraint follow_up_events_event_type_check,
  add constraint follow_up_events_event_type_check
    check (event_type in ('knock', 'interaction', 'text_attempt')),
  drop constraint follow_up_events_check,
  add constraint follow_up_events_check check (
    (event_type = 'knock' and knock_outcome is not null
      and not had_spiritual_conversation and not interview_completed
      and not kgp_shared and not received_christ and not invited_to_community_group)
    or (event_type = 'interaction' and knock_outcome is null)
    or (event_type = 'text_attempt' and knock_outcome is null
      and contact_method is not distinct from 'text'
      and not found_home and not had_spiritual_conversation
      and not interview_completed and not kgp_shared
      and not received_christ and not invited_to_community_group
      and (status_after is null or status_after = 'attempted_contact'))
  );

alter table public.follow_up_events
  drop constraint if exists follow_up_events_text_details_check,
  add constraint follow_up_events_text_details_check check (
    (event_type <> 'text_attempt' and text_purposes is null and text_event_name is null)
    or (event_type = 'text_attempt'
      and text_purposes is not null
      and cardinality(text_purposes) between 1 and 5
      and array_ndims(text_purposes) = 1
      and array_position(text_purposes, null) is null
      and text_purposes <@ array['invite_cg','invite_acg','appointment','invite_event','follow_up']::text[]
      and (
        ('invite_event' = any(text_purposes) and text_event_name is not null
          and char_length(btrim(text_event_name)) between 1 and 100)
        or (not ('invite_event' = any(text_purposes)) and text_event_name is null)
      )
      and (notes is null or char_length(notes) <= 2000)
    )
  );

-- The pre-existing routines continue to receive exactly the two event types
-- they handled before this feature. Text validation/application is independent.
drop trigger validate_follow_up_event_before_insert on public.follow_up_events;
create trigger validate_follow_up_event_before_insert
  before insert on public.follow_up_events for each row
  when (new.event_type in ('knock', 'interaction'))
  execute function private.validate_follow_up_event();

drop trigger apply_follow_up_event_after_insert on public.follow_up_events;
create trigger apply_follow_up_event_after_insert
  after insert on public.follow_up_events for each row
  when (new.event_type in ('knock', 'interaction'))
  execute function private.apply_follow_up_event();

drop trigger follow_up_clear_coaching_correction_on_new_event on public.follow_up_events;
create trigger follow_up_clear_coaching_correction_on_new_event
  after insert on public.follow_up_events for each row
  when (new.event_type in ('knock', 'interaction'))
  execute function private.clear_follow_up_coaching_correction_on_new_event();

create or replace function private.validate_text_attempt()
returns trigger language plpgsql security definer set search_path to ''
as $validate_text_attempt$
declare
  v_status text;
begin
  if auth.uid() is null or not private.is_approved_user() then
    raise exception 'Active Follow Up access is required.';
  end if;
  if new.performed_by is distinct from auth.uid() then
    raise exception 'You may only record your own text attempts.';
  end if;
  select c.status into v_status
  from public.follow_up_contacts c
  join public.follow_up_campaigns campaign on campaign.id = c.campaign_id
  where c.id = new.contact_id and campaign.status::text = 'active'
  for update of c;
  if not found then
    raise exception 'Contact is not part of the active Follow Up campaign.';
  end if;
  new.status_after := case when v_status = 'uncontacted' then 'attempted_contact' else null end;
  select display_name into new.performed_by_name from public.profiles where id = auth.uid();
  return new;
end;
$validate_text_attempt$;

create or replace function private.apply_text_attempt()
returns trigger language plpgsql security definer set search_path to ''
as $apply_text_attempt$
begin
  update public.follow_up_contacts set status = 'attempted_contact'
  where id = new.contact_id and status = 'uncontacted';
  return new;
end;
$apply_text_attempt$;

revoke all on function private.validate_text_attempt() from public, anon, authenticated;
revoke all on function private.apply_text_attempt() from public, anon, authenticated;

drop trigger if exists validate_text_attempt_before_insert on public.follow_up_events;
create trigger validate_text_attempt_before_insert
  before insert on public.follow_up_events for each row
  when (new.event_type = 'text_attempt') execute function private.validate_text_attempt();

drop trigger if exists apply_text_attempt_after_insert on public.follow_up_events;
create trigger apply_text_attempt_after_insert
  after insert on public.follow_up_events for each row
  when (new.event_type = 'text_attempt') execute function private.apply_text_attempt();

create or replace function public.log_text_attempt(
  p_event_id uuid, p_contact_id uuid, p_purposes text[],
  p_event_name text default null, p_notes text default null
)
returns jsonb language plpgsql security definer set search_path to ''
as $log_text_attempt$
declare
  v_existing public.follow_up_events%rowtype;
begin
  if auth.uid() is null or not private.is_approved_user() then
    raise exception 'Active Follow Up access is required.';
  end if;
  if p_event_id is null then raise exception 'A text attempt identifier is required.'; end if;

  perform c.id from public.follow_up_contacts c
  join public.follow_up_campaigns campaign on campaign.id = c.campaign_id
  where c.id = p_contact_id and campaign.status::text = 'active'
  for update of c;
  if not found then raise exception 'Contact is not part of the active Follow Up campaign.'; end if;

  -- Retry the same submission safely after a dropped mobile connection.
  select * into v_existing from public.follow_up_events where id = p_event_id;
  if found then
    if v_existing.event_type <> 'text_attempt'
      or v_existing.contact_id is distinct from p_contact_id
      or v_existing.performed_by is distinct from auth.uid() then
      raise exception 'This text attempt identifier is already in use.';
    end if;
    return jsonb_build_object('event_id', p_event_id, 'contact_id', p_contact_id);
  end if;

  insert into public.follow_up_events (
    id, contact_id, performed_by, event_type, contact_method,
    text_purposes, text_event_name, notes
  ) values (
    p_event_id, p_contact_id, auth.uid(), 'text_attempt', 'text',
    p_purposes,
    case when 'invite_event' = any(p_purposes) then nullif(btrim(p_event_name), '') else null end,
    nullif(btrim(p_notes), '')
  );
  return jsonb_build_object('event_id', p_event_id, 'contact_id', p_contact_id);
end;
$log_text_attempt$;

create or replace function public.update_text_attempt(
  p_event_id uuid, p_occurred_at timestamptz, p_purposes text[],
  p_event_name text default null, p_notes text default null
)
returns jsonb language plpgsql security definer set search_path to ''
as $update_text_attempt$
declare
  v_role text;
  v_contact_id uuid;
  v_performed_by uuid;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  select role::text into v_role from public.profiles where id = auth.uid() and is_active = true;
  if v_role is null or v_role not in ('student_leader', 'discipler', 'staff', 'admin') then
    raise exception 'Active Follow Up access is required.';
  end if;
  select e.contact_id, e.performed_by into v_contact_id, v_performed_by
  from public.follow_up_events e
  join public.follow_up_contacts c on c.id = e.contact_id
  join public.follow_up_campaigns campaign on campaign.id = c.campaign_id
  where e.id = p_event_id and e.event_type = 'text_attempt' and campaign.status::text = 'active'
  for update of e;
  if not found then raise exception 'Text attempt not found.'; end if;
  if v_role not in ('staff', 'admin') and v_performed_by is distinct from auth.uid() then
    raise exception 'You may only edit history that you recorded.';
  end if;
  if p_occurred_at is null then raise exception 'Date and time are required.'; end if;
  update public.follow_up_events set occurred_at = p_occurred_at,
    text_purposes = p_purposes,
    text_event_name = case when 'invite_event' = any(p_purposes) then nullif(btrim(p_event_name), '') else null end,
    notes = nullif(btrim(p_notes), '')
  where id = p_event_id;
  return jsonb_build_object('event_id', p_event_id, 'contact_id', v_contact_id);
end;
$update_text_attempt$;

revoke all on function public.log_text_attempt(uuid,uuid,text[],text,text) from public, anon;
grant execute on function public.log_text_attempt(uuid,uuid,text[],text,text) to authenticated;
revoke all on function public.update_text_attempt(uuid,timestamptz,text[],text,text) from public, anon;
grant execute on function public.update_text_attempt(uuid,timestamptz,text[],text,text) to authenticated;


-- Existing deletion rules, extended only to recognize text attempts.
CREATE OR REPLACE FUNCTION public.delete_follow_up_event(p_event_id uuid, p_unassign_primary boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_contact_id uuid;
  v_event_type text;
  v_performed_by uuid;
  v_primary_owner_id uuid;
  v_status_before text;
  v_status_after text;
  v_remaining_knocks integer := 0;
  v_remaining_interactions integer := 0;
  v_remaining_text_attempts integer := 0;
  v_status_changed boolean := false;
  v_unassigned boolean := false;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  select p.role::text
  into v_user_role
  from public.profiles p
  where p.id = v_user_id
    and p.is_active = true;

  if v_user_role is null
     or v_user_role not in (
       'student_leader',
       'discipler',
       'staff',
       'admin'
     ) then
    raise exception 'Active Follow Up access is required.';
  end if;

  select
    e.contact_id,
    e.event_type::text,
    e.performed_by,
    c.primary_owner_id,
    c.status::text
  into
    v_contact_id,
    v_event_type,
    v_performed_by,
    v_primary_owner_id,
    v_status_before
  from public.follow_up_events e
  join public.follow_up_contacts c
    on c.id = e.contact_id
  join public.follow_up_campaigns campaign
    on campaign.id = c.campaign_id
  where e.id = p_event_id
    and campaign.status::text = 'active'
  for update of e, c;

  if v_contact_id is null then
    raise exception 'Follow Up history entry not found.';
  end if;

  if v_event_type not in ('knock', 'interaction', 'text_attempt') then
    raise exception 'Only knock, interaction, and text attempt history can be deleted.';
  end if;

  if v_user_role not in ('staff', 'admin')
     and v_performed_by is distinct from v_user_id then
    raise exception 'You may only delete history that you recorded.';
  end if;

  -- Unassigning is only valid when deleting an interaction whose performer
  -- is still the current primary owner. This prevents an unrelated history
  -- correction from silently changing assignment.
  if coalesce(p_unassign_primary, false)
     and (
       v_event_type <> 'interaction'
       or v_primary_owner_id is null
       or v_performed_by is distinct from v_primary_owner_id
     ) then
    raise exception
      'This history entry cannot be used to clear the current primary assignment.';
  end if;

  delete from public.follow_up_events e
  where e.id = p_event_id;

  perform private.recalculate_follow_up_contact_progress(v_contact_id);

  select
    count(*) filter (
      where remaining.event_type::text = 'knock'
    )::integer,
    count(*) filter (
      where remaining.event_type::text = 'interaction'
    )::integer,
    count(*) filter (where remaining.event_type::text = 'text_attempt')::integer
  into
    v_remaining_knocks,
    v_remaining_interactions,
    v_remaining_text_attempts
  from public.follow_up_events remaining
  where remaining.contact_id = v_contact_id
    and remaining.event_type::text in ('knock', 'interaction', 'text_attempt');

  v_status_after := v_status_before;

  if v_event_type = 'text_attempt' and v_status_before <> 'attempted_contact' then
    -- Deleting a text must not undo a staff-selected relationship status.
    v_status_after := v_status_before;

  elsif v_remaining_interactions > 0 then
    v_status_after := v_status_before;

  elsif v_remaining_knocks > 0 or v_remaining_text_attempts > 0 then
    v_status_after := 'attempted_contact';

    if v_status_before <> v_status_after then
      perform public.set_follow_up_contact_status(
        v_contact_id,
        v_status_after
      );
      v_status_changed := true;
    end if;

  else
    v_status_after := 'uncontacted';

    if v_status_before <> v_status_after then
      perform public.set_follow_up_contact_status(
        v_contact_id,
        v_status_after
      );
      v_status_changed := true;
    end if;

    -- Coaching-only correction exemption. This remains useful only when
    -- the current owner stays assigned after their final mistaken event
    -- is deleted. If the contact is unassigned below, the owner-change
    -- trigger clears this marker automatically.
    update public.follow_up_contacts c
    set
      coaching_correction_exempt_owner_id =
        case
          when v_primary_owner_id is not null
           and v_primary_owner_id = v_performed_by
          then v_primary_owner_id
          else null
        end,
      coaching_correction_exempt_at =
        case
          when v_primary_owner_id is not null
           and v_primary_owner_id = v_performed_by
          then now()
          else null
        end
    where c.id = v_contact_id;
  end if;

  if coalesce(p_unassign_primary, false) then
    update public.follow_up_contacts c
    set primary_owner_id = null
    where c.id = v_contact_id
      and c.primary_owner_id = v_primary_owner_id;

    v_unassigned := found;
  end if;

  return jsonb_build_object(
    'event_id', p_event_id,
    'contact_id', v_contact_id,
    'event_type', v_event_type,
    'status_changed', v_status_changed,
    'status', v_status_after,
    'remaining_knocks', v_remaining_knocks,
    'remaining_interactions', v_remaining_interactions,
    'remaining_text_attempts', v_remaining_text_attempts,
    'unassigned', v_unassigned
  );
end;
$function$;

-- Existing filters and pagination; attach latest text only to returned cards.
CREATE OR REPLACE FUNCTION public.get_follow_up_contact_results_v2(p_view text, p_sort text DEFAULT 'name'::text, p_dir text DEFAULT 'asc'::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50, p_campus text DEFAULT NULL::text, p_location text DEFAULT NULL::text, p_gender text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_jesus text DEFAULT NULL::text, p_community text DEFAULT NULL::text, p_interview text DEFAULT NULL::text, p_kgp text DEFAULT NULL::text, p_interview_done text DEFAULT NULL::text, p_affinity text DEFAULT NULL::text, p_floor text DEFAULT NULL::text, p_wing text DEFAULT NULL::text, p_room_only boolean DEFAULT false, p_invited_to_cg text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
  v_campaign_label text;
  v_default_area_id uuid;
  v_default_area_name text;
  v_default_area_type text;

  v_view text := lower(btrim(coalesce(p_view, '')));
  v_sort text := lower(btrim(coalesce(p_sort, 'name')));
  v_dir text := lower(btrim(coalesce(p_dir, 'asc')));
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 50), 1), 100);
  v_offset integer;

  v_campus text := nullif(btrim(coalesce(p_campus, '')), '');
  v_location text := nullif(btrim(coalesce(p_location, '')), '');
  v_gender text := nullif(lower(btrim(coalesce(p_gender, ''))), '');
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_jesus_values text[] := case
    when nullif(btrim(coalesce(p_jesus, '')), '') is null then null
    else regexp_split_to_array(lower(btrim(p_jesus)), '\s*,\s*')
  end;
  v_community_values text[] := case
    when nullif(btrim(coalesce(p_community, '')), '') is null then null
    else regexp_split_to_array(lower(btrim(p_community)), '\s*,\s*')
  end;
  v_interview_values text[] := case
    when nullif(btrim(coalesce(p_interview, '')), '') is null then null
    else regexp_split_to_array(lower(btrim(p_interview)), '\s*,\s*')
  end;
  v_kgp text := nullif(lower(btrim(coalesce(p_kgp, ''))), '');
  v_interview_done text := nullif(lower(btrim(coalesce(p_interview_done, ''))), '');
  v_invited_to_cg text := nullif(lower(btrim(coalesce(p_invited_to_cg, ''))), '');
  v_affinity text := nullif(btrim(coalesce(p_affinity, '')), '');
  v_floor text := nullif(btrim(coalesce(p_floor, '')), '');
  v_wing text := nullif(btrim(coalesce(p_wing, '')), '');
  v_room_only boolean := coalesce(p_room_only, false);

  v_total_count integer := 0;
  v_rows jsonb := '[]'::jsonb;
  v_floor_options jsonb := '[]'::jsonb;
  v_wing_options jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'You must be signed in to use Follow Up.';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.is_active = true
      and p.role::text <> 'pending'
  ) then
    raise exception 'Active Follow Up access is required.';
  end if;

  if v_view not in ('mine','goback','gospel','new','cg','noaddress','area') then
    raise exception 'Invalid Follow Up contact view.';
  end if;

  if v_sort not in ('name','room') then
    v_sort := 'name';
  end if;

  if v_dir not in ('asc','desc') then
    v_dir := 'asc';
  end if;

  v_offset := (v_page - 1) * v_page_size;

  select c.id, c.label
  into v_campaign_id, v_campaign_label
  from public.follow_up_campaigns c
  where c.status::text = 'active'
  limit 1;

  if v_campaign_id is null then
    raise exception 'No active Follow Up campaign exists.';
  end if;

  select a.id, a.name, a.area_type::text
  into v_default_area_id, v_default_area_name, v_default_area_type
  from public.profile_ministry_area_assignments pa
  join public.ministry_areas a on a.id = pa.ministry_area_id
  where pa.campaign_id = v_campaign_id
    and pa.profile_id = v_user_id
    and pa.is_default = true
    and a.is_active = true
  limit 1;

  with base as (
    select
      c.id,
      c.student_id,
      c.ministry_location_id,
      c.primary_owner_id,
      c.year_at_um,
      c.gender_raw,
      c.phone,
      c.jesus_interest,
      c.community_interest,
      c.interview_interest,
      c.house_name,
      c.room_or_address,
      c.location_resolution,
      c.status,
      c.knock_count,
      c.last_knock_at,
      c.interview_completed_at,
      c.kgp_shared_at,
      c.received_christ_at,
      s.display_name,
      s.uniqname,
      s.umich_email,
      area.name as area_name,
      area.parent_id as area_parent_id,

      case
        when area.name in (
          'West Quad',
          'East Quad',
          'South Quad',
          'North Quad',
          'Munger',
          'Markley',
          'Mosher Jordan (MoJo)',
          'Alice Lloyd',
          'Couzens',
          'Stockwell',
          'Bursley',
          'Building 1',
          'Building 2',
          'Building 3',
          'Building 4',
          'Harper Hall'
        )
        and btrim(coalesce(c.room_or_address, '')) ~ '^[0-9]{4}$'
          then substr(btrim(c.room_or_address), 1, 1)
        else null
      end as derived_floor,

      case
        when area.name in (
          'West Quad',
          'East Quad',
          'South Quad',
          'North Quad',
          'Munger',
          'Markley',
          'Mosher Jordan (MoJo)',
          'Alice Lloyd',
          'Couzens',
          'Stockwell',
          'Bursley',
          'Building 1',
          'Building 2',
          'Building 3',
          'Building 4',
          'Harper Hall'
        )
        and btrim(coalesce(c.room_or_address, '')) ~ '^[0-9]{4}$'
          then substr(btrim(c.room_or_address), 2, 1)
        else null
      end as derived_wing,

      case
        when lower(btrim(coalesce(c.gender_raw,''))) in ('male','m','man') then 'male'
        when lower(btrim(coalesce(c.gender_raw,''))) in ('female','f','woman') then 'female'
        else 'other'
      end as gender_category,

      case
        when v_default_area_id is null then true
        when v_default_area_type = 'affinity' then exists (
          select 1
          from public.follow_up_contact_affinities ca
          where ca.contact_id = c.id
            and ca.ministry_area_id = v_default_area_id
        )
        when v_default_area_type = 'campus_region' then (
          c.ministry_location_id = v_default_area_id
          or area.parent_id = v_default_area_id
        )
        else c.ministry_location_id = v_default_area_id
      end as in_default_area,

      exists (
        select 1
        from public.follow_up_events e
        where e.contact_id = c.id
          and e.event_type = 'interaction'
          and e.performed_by = v_user_id
      ) as personally_interacted,

      exists (
        select 1
        from public.follow_up_events e
        where e.contact_id = c.id
          and e.event_type = 'interaction'
      ) as has_any_interaction,

      exists (
        select 1
        from public.follow_up_events e
        where e.contact_id = c.id
          and e.event_type = 'interaction'
          and e.invited_to_community_group = true
      ) as invited_to_community_group,

      case
        when v_affinity is null then true
        else exists (
          select 1
          from public.follow_up_contact_affinities ca
          where ca.contact_id = c.id
            and ca.ministry_area_id::text = v_affinity
        )
      end as matches_affinity_filter

    from public.follow_up_contacts c
    join public.students s on s.id = c.student_id
    left join public.ministry_areas area on area.id = c.ministry_location_id
    where c.campaign_id = v_campaign_id
  ),

  pre_spatial_filtered as (
    select *
    from base b
    where
      (
        (v_view = 'mine' and b.primary_owner_id = v_user_id)
        or
        (v_view = 'goback' and b.personally_interacted and b.status <> 'not_interested')
        or
        (v_view = 'gospel'
          and b.status <> 'not_interested'
          and b.kgp_shared_at is null
          and (b.jesus_interest in ('yes','maybe') or b.interview_interest in ('yes','maybe')))
        or
        (v_view = 'new'
          and b.status <> 'not_interested'
          and (
            b.jesus_interest in ('yes','maybe')
            or b.community_interest in ('yes','maybe')
            or b.interview_interest in ('yes','maybe')
          )
          and not b.has_any_interaction)
        or
        (v_view = 'cg'
          and b.status <> 'not_interested'
          and b.community_interest in ('yes','maybe'))
        or
        (v_view = 'noaddress'
          and b.location_resolution = 'no_address'
          and b.status <> 'not_interested'
          and (
            b.jesus_interest in ('yes','maybe')
            or b.community_interest in ('yes','maybe')
            or b.interview_interest in ('yes','maybe')
          ))
        or
        (v_view = 'area')
      )

      and (
        v_campus is null
        or b.ministry_location_id::text = v_campus
        or b.area_parent_id::text = v_campus
      )

      and (
        v_location is null
        or (v_location = 'no_address' and b.location_resolution = 'no_address')
        or (v_location = 'needs_area_assignment' and b.location_resolution = 'needs_area_assignment')
        or (
          v_location not in ('no_address','needs_area_assignment')
          and b.ministry_location_id::text = v_location
        )
      )

      and (v_gender is null or b.gender_category = v_gender)
      and (v_status is null or b.status = v_status)
      and (
        v_jesus_values is null
        or b.jesus_interest = any(v_jesus_values)
      )
      and (
        v_community_values is null
        or b.community_interest = any(v_community_values)
      )
      and (
        v_interview_values is null
        or b.interview_interest = any(v_interview_values)
      )

      and (
        v_kgp is null
        or (v_kgp = 'shared' and b.kgp_shared_at is not null)
        or (v_kgp = 'not_shared' and b.kgp_shared_at is null)
      )

      and (
        v_interview_done is null
        or (v_interview_done = 'completed' and b.interview_completed_at is not null)
        or (v_interview_done = 'not_completed' and b.interview_completed_at is null)
      )

      and (
        v_invited_to_cg is null
        or (v_invited_to_cg = 'invited' and b.invited_to_community_group)
        or (v_invited_to_cg = 'not_invited' and not b.invited_to_community_group)
      )

      and b.matches_affinity_filter
  ),

  floor_options as (
    select coalesce(
      jsonb_agg(option_value order by option_value),
      '[]'::jsonb
    ) as values
    from (
      select distinct derived_floor as option_value
      from pre_spatial_filtered
      where v_location is not null
        and v_location not in ('no_address','needs_area_assignment')
        and derived_floor is not null
    ) options
  ),

  wing_options as (
    select coalesce(
      jsonb_agg(option_value order by option_value),
      '[]'::jsonb
    ) as values
    from (
      select distinct derived_wing as option_value
      from pre_spatial_filtered
      where v_location is not null
        and v_location not in ('no_address','needs_area_assignment')
        and derived_wing is not null
    ) options
  ),

  filtered as (
    select *
    from pre_spatial_filtered b
    where
      (v_floor is null or b.derived_floor = v_floor)
      and
      (v_wing is null or b.derived_wing = v_wing)
      and
      (
        not v_room_only
        or (
          b.room_or_address is not null
          and btrim(b.room_or_address) ~ '[0-9]'
        )
      )
  ),

  counted as (
    select count(*)::integer as total_count
    from filtered
  ),

  ordered as (
    select
      f.*,
      row_number() over (
        order by
          case when v_sort = 'name' and v_dir = 'asc'
            then lower(coalesce(f.display_name,'')) end asc,
          case when v_sort = 'name' and v_dir = 'desc'
            then lower(coalesce(f.display_name,'')) end desc,
          case when v_sort = 'room' and v_dir = 'asc'
            then coalesce(f.room_or_address,'') end asc,
          case when v_sort = 'room' and v_dir = 'desc'
            then coalesce(f.room_or_address,'') end desc,
          lower(coalesce(f.display_name,'')) asc,
          f.id asc
      ) as sort_ordinal
    from filtered f
  ),

  page_rows as (
    select *
    from ordered
    order by sort_ordinal
    offset v_offset
    limit v_page_size
  ),

  rendered as (
    select
      p.*,
      owner.display_name as owner_name,

      coalesce(
        affinities.affinity_names,
        '[]'::jsonb
      ) as affinity_names,

      coalesce(
        notes.interaction_notes,
        '[]'::jsonb
      ) as interaction_notes,

      coalesce(
        interaction_stats.interaction_count,
        0
      ) as interaction_count,

      interaction_stats.last_interaction_at

    from page_rows p

    left join public.profiles owner
      on owner.id = p.primary_owner_id

    left join lateral (
      select jsonb_agg(a.name order by a.name) as affinity_names
      from public.follow_up_contact_affinities ca
      join public.ministry_areas a
        on a.id = ca.ministry_area_id
      where ca.contact_id = p.id
    ) affinities on true

    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'occurred_at', e.occurred_at,
          'notes', e.notes,
          'performed_by', e.performed_by,
          'performer_name', coalesce(
            performer.display_name,
            'Follow Up leader'
          )
        )
        order by e.occurred_at desc
      ) as interaction_notes
      from public.follow_up_events e
      left join public.profiles performer
        on performer.id = e.performed_by
      where e.contact_id = p.id
        and e.event_type = 'interaction'
        and e.notes is not null
        and btrim(e.notes) <> ''
    ) notes on true

    left join lateral (
      select
        count(*)::integer as interaction_count,
        max(e.occurred_at) as last_interaction_at
      from public.follow_up_events e
      where e.contact_id = p.id
        and e.event_type = 'interaction'
    ) interaction_stats on true
  )

  select
    counted.total_count,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'student_id', r.student_id,
          'ministry_location_id', r.ministry_location_id,
          'primary_owner_id', r.primary_owner_id,
          'year_at_um', r.year_at_um,
          'gender_raw', r.gender_raw,
          'phone', r.phone,
          'jesus_interest', r.jesus_interest,
          'community_interest', r.community_interest,
          'interview_interest', r.interview_interest,
          'house_name', r.house_name,
          'room_or_address', r.room_or_address,
          'location_resolution', r.location_resolution,
          'status', r.status,
          'knock_count', r.knock_count,
          'last_knock_at', r.last_knock_at,
          'interview_completed_at', r.interview_completed_at,
          'kgp_shared_at', r.kgp_shared_at,
          'received_christ_at', r.received_christ_at,
          'display_name', r.display_name,
          'uniqname', r.uniqname,
          'umich_email', r.umich_email,
          'area_name', r.area_name,
          'owner_name', r.owner_name,
          'affinity_names', r.affinity_names,
          'interaction_notes', r.interaction_notes,
          'interaction_count', r.interaction_count,
          'last_interaction_at', r.last_interaction_at,
          'latest_text_attempt', (
            select jsonb_build_object(
              'occurred_at', text_event.occurred_at,
              'text_purposes', text_event.text_purposes,
              'text_event_name', text_event.text_event_name
            )
            from public.follow_up_events text_event
            where text_event.contact_id = r.id and text_event.event_type = 'text_attempt'
            order by text_event.occurred_at desc, text_event.created_at desc, text_event.id desc
            limit 1
          ),
          'invited_to_community_group', r.invited_to_community_group
        )
        order by r.sort_ordinal
      ) filter (where r.id is not null),
      '[]'::jsonb
    ),
    floor_options.values,
    wing_options.values
  into
    v_total_count,
    v_rows,
    v_floor_options,
    v_wing_options
  from counted
  cross join floor_options
  cross join wing_options
  left join rendered r on true
  group by
    counted.total_count,
    floor_options.values,
    wing_options.values;

  return jsonb_build_object(
    'campaign_id', v_campaign_id,
    'campaign_label', v_campaign_label,
    'default_area_id', v_default_area_id,
    'default_area_name', coalesce(v_default_area_name, 'All Campus'),
    'total_count', v_total_count,
    'page', v_page,
    'page_size', v_page_size,
    'floor_options', v_floor_options,
    'wing_options', v_wing_options,
    'rows', v_rows
  );
end;
$function$;

notify pgrst, 'reload schema';
commit;
