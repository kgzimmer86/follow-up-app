-- Home card-count optimization.
--
-- This adds one read-only RPC for Home. It calculates all six card counts in
-- one database pass and does not return contact rows or change student data.
-- Run this before deploying the matching app change.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_follow_up_home_filtered_counts(
  p_current_view text DEFAULT NULL::text,
  p_campus text DEFAULT NULL::text,
  p_location text DEFAULT NULL::text,
  p_gender text DEFAULT NULL::text,
  p_status text DEFAULT NULL::text,
  p_jesus text DEFAULT NULL::text,
  p_community text DEFAULT NULL::text,
  p_interview text DEFAULT NULL::text,
  p_kgp text DEFAULT NULL::text,
  p_interview_done text DEFAULT NULL::text,
  p_affinity text DEFAULT NULL::text,
  p_floor text DEFAULT NULL::text,
  p_wing text DEFAULT NULL::text,
  p_room_only boolean DEFAULT false,
  p_invited_to_cg text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
  v_current_view text := nullif(lower(btrim(coalesce(p_current_view, ''))), '');
  v_campus text := nullif(btrim(coalesce(p_campus, '')), '');
  v_location text := nullif(btrim(coalesce(p_location, '')), '');
  v_gender text := nullif(lower(btrim(coalesce(p_gender, ''))), '');
  v_status text := nullif(lower(btrim(coalesce(p_status, ''))), '');
  v_jesus_values text[] := CASE
    WHEN nullif(btrim(coalesce(p_jesus, '')), '') IS NULL THEN NULL
    ELSE regexp_split_to_array(lower(btrim(p_jesus)), '\s*,\s*')
  END;
  v_community_values text[] := CASE
    WHEN nullif(btrim(coalesce(p_community, '')), '') IS NULL THEN NULL
    ELSE regexp_split_to_array(lower(btrim(p_community)), '\s*,\s*')
  END;
  v_interview_values text[] := CASE
    WHEN nullif(btrim(coalesce(p_interview, '')), '') IS NULL THEN NULL
    ELSE regexp_split_to_array(lower(btrim(p_interview)), '\s*,\s*')
  END;
  v_kgp text := nullif(lower(btrim(coalesce(p_kgp, ''))), '');
  v_interview_done text := nullif(lower(btrim(coalesce(p_interview_done, ''))), '');
  v_affinity text := nullif(btrim(coalesce(p_affinity, '')), '');
  v_floor text := nullif(btrim(coalesce(p_floor, '')), '');
  v_wing text := nullif(btrim(coalesce(p_wing, '')), '');
  v_room_only boolean := coalesce(p_room_only, false);
  v_invited_to_cg text := nullif(lower(btrim(coalesce(p_invited_to_cg, ''))), '');
  v_counts jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to use Follow Up.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.is_active = true
      AND p.role::text <> 'pending'
  ) THEN
    RAISE EXCEPTION 'Active Follow Up access is required.';
  END IF;

  IF v_current_view NOT IN ('mine', 'goback', 'gospel', 'new', 'cg', 'noaddress', 'area') THEN
    v_current_view := NULL;
  END IF;

  SELECT c.id
  INTO v_campaign_id
  FROM public.follow_up_campaigns c
  WHERE c.status::text = 'active'
  LIMIT 1;

  IF v_campaign_id IS NULL THEN
    RAISE EXCEPTION 'No active Follow Up campaign exists.';
  END IF;

  WITH target_views(view) AS (
    VALUES
      ('mine'::text),
      ('goback'::text),
      ('gospel'::text),
      ('new'::text),
      ('cg'::text),
      ('noaddress'::text)
  ),
  event_flags AS (
    SELECT
      e.contact_id,
      bool_or(e.event_type = 'interaction') AS has_any_interaction,
      bool_or(
        e.event_type = 'interaction'
        AND e.performed_by = v_user_id
      ) AS personally_interacted,
      bool_or(
        e.event_type = 'interaction'
        AND e.invited_to_community_group = true
      ) AS invited_to_community_group
    FROM public.follow_up_events e
    JOIN public.follow_up_contacts c
      ON c.id = e.contact_id
     AND c.campaign_id = v_campaign_id
    WHERE e.event_type = 'interaction'
    GROUP BY e.contact_id
  ),
  base AS (
    SELECT
      c.id,
      c.ministry_location_id,
      c.primary_owner_id,
      c.gender_raw,
      c.jesus_interest,
      c.community_interest,
      c.interview_interest,
      c.location_resolution,
      c.room_or_address,
      c.status,
      c.interview_completed_at,
      c.kgp_shared_at,
      area.parent_id AS area_parent_id,

      CASE
        WHEN area.name IN (
          'West Quad', 'East Quad', 'South Quad', 'North Quad', 'Munger',
          'Markley', 'Mosher Jordan (MoJo)', 'Alice Lloyd', 'Couzens',
          'Stockwell', 'Bursley', 'Building 1', 'Building 2', 'Building 3',
          'Building 4', 'Harper Hall'
        )
        AND btrim(coalesce(c.room_or_address, '')) ~ '^[0-9]{4}$'
          THEN substr(btrim(c.room_or_address), 1, 1)
        ELSE NULL
      END AS derived_floor,

      CASE
        WHEN area.name IN (
          'West Quad', 'East Quad', 'South Quad', 'North Quad', 'Munger',
          'Markley', 'Mosher Jordan (MoJo)', 'Alice Lloyd', 'Couzens',
          'Stockwell', 'Bursley', 'Building 1', 'Building 2', 'Building 3',
          'Building 4', 'Harper Hall'
        )
        AND btrim(coalesce(c.room_or_address, '')) ~ '^[0-9]{4}$'
          THEN substr(btrim(c.room_or_address), 2, 1)
        ELSE NULL
      END AS derived_wing,

      CASE
        WHEN lower(btrim(coalesce(c.gender_raw, ''))) IN ('male', 'm', 'man') THEN 'male'
        WHEN lower(btrim(coalesce(c.gender_raw, ''))) IN ('female', 'f', 'woman') THEN 'female'
        ELSE 'other'
      END AS gender_category,

      coalesce(ef.has_any_interaction, false) AS has_any_interaction,
      coalesce(ef.personally_interacted, false) AS personally_interacted,
      coalesce(ef.invited_to_community_group, false) AS invited_to_community_group,

      CASE
        WHEN v_affinity IS NULL THEN true
        ELSE EXISTS (
          SELECT 1
          FROM public.follow_up_contact_affinities ca
          WHERE ca.contact_id = c.id
            AND ca.ministry_area_id::text = v_affinity
        )
      END AS matches_affinity_filter

    FROM public.follow_up_contacts c
    LEFT JOIN public.ministry_areas area
      ON area.id = c.ministry_location_id
    LEFT JOIN event_flags ef
      ON ef.contact_id = c.id
    WHERE c.campaign_id = v_campaign_id
  ),
  counted AS (
    SELECT
      tv.view,
      count(b.id)::integer AS total_count
    FROM target_views tv
    LEFT JOIN base b
      ON
      CASE
        WHEN tv.view = 'mine' THEN b.primary_owner_id = v_user_id
        WHEN tv.view = 'goback' THEN b.personally_interacted AND b.status <> 'not_interested'
        WHEN tv.view = 'gospel' THEN
          b.status <> 'not_interested'
          AND b.kgp_shared_at IS NULL
          AND (
            b.jesus_interest IN ('yes', 'maybe')
            OR b.interview_interest IN ('yes', 'maybe')
          )
        WHEN tv.view = 'new' THEN
          b.status <> 'not_interested'
          AND (
            b.jesus_interest IN ('yes', 'maybe')
            OR b.community_interest IN ('yes', 'maybe')
            OR b.interview_interest IN ('yes', 'maybe')
          )
          AND NOT b.has_any_interaction
        WHEN tv.view = 'cg' THEN
          b.status <> 'not_interested'
          AND b.community_interest IN ('yes', 'maybe')
        WHEN tv.view = 'noaddress' THEN
          b.location_resolution = 'no_address'
          AND b.status <> 'not_interested'
          AND (
            b.jesus_interest IN ('yes', 'maybe')
            OR b.community_interest IN ('yes', 'maybe')
            OR b.interview_interest IN ('yes', 'maybe')
          )
        ELSE false
      END

      AND b.matches_affinity_filter
      AND (v_gender IS NULL OR b.gender_category = v_gender)

      -- No Address intentionally omits campus, dorm, floor, wing, and room
      -- filters, matching filtersForContactView in the app.
      AND (
        tv.view = 'noaddress'
        OR (
          (v_campus IS NULL
            OR b.ministry_location_id::text = v_campus
            OR b.area_parent_id::text = v_campus)
          AND (
            v_location IS NULL
            OR (v_location = 'no_address' AND b.location_resolution = 'no_address')
            OR (v_location = 'needs_area_assignment' AND b.location_resolution = 'needs_area_assignment')
            OR (
              v_location NOT IN ('no_address', 'needs_area_assignment')
              AND b.ministry_location_id::text = v_location
            )
          )
          AND (v_floor IS NULL OR b.derived_floor = v_floor)
          AND (v_wing IS NULL OR b.derived_wing = v_wing)
        )
      )

      -- Card-specific choices travel only with the card that owns them.
      AND (
        v_current_view IS DISTINCT FROM tv.view
        OR (
          (v_status IS NULL OR b.status = v_status)
          AND (v_jesus_values IS NULL OR b.jesus_interest = ANY(v_jesus_values))
          AND (v_community_values IS NULL OR b.community_interest = ANY(v_community_values))
          AND (v_interview_values IS NULL OR b.interview_interest = ANY(v_interview_values))
          AND (
            v_kgp IS NULL
            OR (v_kgp = 'shared' AND b.kgp_shared_at IS NOT NULL)
            OR (v_kgp = 'not_shared' AND b.kgp_shared_at IS NULL)
          )
          AND (
            v_interview_done IS NULL
            OR (v_interview_done = 'completed' AND b.interview_completed_at IS NOT NULL)
            OR (v_interview_done = 'not_completed' AND b.interview_completed_at IS NULL)
          )
          AND (
            v_invited_to_cg IS NULL
            OR (v_invited_to_cg = 'invited' AND b.invited_to_community_group)
            OR (v_invited_to_cg = 'not_invited' AND NOT b.invited_to_community_group)
          )
          AND (
            NOT v_room_only
            OR (
              b.room_or_address IS NOT NULL
              AND btrim(b.room_or_address) ~ '[0-9]'
            )
          )
        )
      )
    GROUP BY tv.view
  )
  SELECT jsonb_object_agg(view, total_count ORDER BY view)
  INTO v_counts
  FROM counted;

  RETURN jsonb_build_object('counts', coalesce(v_counts, '{}'::jsonb));
END;
$function$;

REVOKE ALL ON FUNCTION public.get_follow_up_home_filtered_counts(
  text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_follow_up_home_filtered_counts(
  text, text, text, text, text, text, text, text, text, text, text, text, text, boolean, text
) TO authenticated;

COMMIT;
