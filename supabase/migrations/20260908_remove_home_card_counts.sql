-- Home no longer displays card counts. Keep the dashboard RPC for the
-- default-area context and four recent contacts, but remove the expensive
-- count-only scan. This does not change contact data or filtering behavior.
-- Run this once in the Supabase SQL Editor before deploying the matching app change.

CREATE OR REPLACE FUNCTION public.get_follow_up_home_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $home_dashboard_without_counts$
declare
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
  v_campaign_label text;
  v_default_area_id uuid;
  v_default_area_name text;
  v_recent_contacts jsonb := '[]'::jsonb;
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

  select c.id, c.label
  into v_campaign_id, v_campaign_label
  from public.follow_up_campaigns c
  where c.status::text = 'active'
  limit 1;

  if v_campaign_id is null then
    return jsonb_build_object(
      'has_active_campaign', false,
      'recent_contacts', '[]'::jsonb
    );
  end if;

  select
    a.id,
    a.name
  into
    v_default_area_id,
    v_default_area_name
  from public.profile_ministry_area_assignments pa
  join public.ministry_areas a
    on a.id = pa.ministry_area_id
  where pa.campaign_id = v_campaign_id
    and pa.profile_id = v_user_id
    and pa.is_default = true
    and a.is_active = true
  limit 1;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', recent.id,
        'display_name', recent.display_name,
        'gender_raw', recent.gender_raw,
        'status', recent.status,
        'jesus_interest', recent.jesus_interest,
        'community_interest', recent.community_interest,
        'interview_interest', recent.interview_interest,
        'kgp_shared_at', recent.kgp_shared_at,
        'interview_completed_at', recent.interview_completed_at,
        'received_christ_at', recent.received_christ_at,
        'area_name', recent.area_name,
        'house_name', recent.house_name,
        'room_or_address', recent.room_or_address,
        'location_resolution', recent.location_resolution,
        'owner_name', recent.owner_name,
        'affinity_names', recent.affinity_names,
        'latest_event_type', recent.latest_event_type,
        'latest_event_at', recent.latest_event_at,
        'recent_notes', recent.recent_notes
      )
      order by recent.latest_event_at desc
    ),
    '[]'::jsonb
  )
  into v_recent_contacts
  from (
    select
      c.id,
      s.display_name,
      c.gender_raw,
      c.status,
      c.jesus_interest,
      c.community_interest,
      c.interview_interest,
      c.kgp_shared_at,
      c.interview_completed_at,
      c.received_christ_at,
      area.name as area_name,
      c.house_name,
      c.room_or_address,
      c.location_resolution,
      owner.display_name as owner_name,
      coalesce(
        affinities.affinity_names,
        '[]'::jsonb
      ) as affinity_names,
      latest_event.event_type as latest_event_type,
      latest_event.occurred_at as latest_event_at,
      coalesce(
        notes.recent_notes,
        '[]'::jsonb
      ) as recent_notes

    from public.follow_up_contacts c

    join public.students s
      on s.id = c.student_id

    join lateral (
      select
        e.event_type,
        e.occurred_at
      from public.follow_up_events e
      where e.contact_id = c.id
        and e.performed_by = v_user_id
      order by e.occurred_at desc
      limit 1
    ) latest_event on true

    left join public.ministry_areas area
      on area.id = c.ministry_location_id

    left join public.profiles owner
      on owner.id = c.primary_owner_id

    left join lateral (
      select jsonb_agg(
        affinity_area.name
        order by affinity_area.name
      ) as affinity_names
      from public.follow_up_contact_affinities ca
      join public.ministry_areas affinity_area
        on affinity_area.id = ca.ministry_area_id
      where ca.contact_id = c.id
    ) affinities on true

    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', note_rows.id,
          'occurred_at', note_rows.occurred_at,
          'notes', note_rows.notes
        )
        order by note_rows.occurred_at desc
      ) as recent_notes
      from (
        select
          e.id,
          e.occurred_at,
          e.notes
        from public.follow_up_events e
        where e.contact_id = c.id
          and e.event_type = 'interaction'
          and e.notes is not null
          and btrim(e.notes) <> ''
        order by e.occurred_at desc
        limit 2
      ) note_rows
    ) notes on true

    where c.campaign_id = v_campaign_id
    order by latest_event.occurred_at desc
    limit 4
  ) recent;

  return jsonb_build_object(
    'has_active_campaign', true,
    'campaign_id', v_campaign_id,
    'campaign_label', v_campaign_label,
    'default_area_id', v_default_area_id,
    'default_area_name', coalesce(
      v_default_area_name,
      'All Campus'
    ),
    'recent_contacts', v_recent_contacts
  );
end;
$home_dashboard_without_counts$;
