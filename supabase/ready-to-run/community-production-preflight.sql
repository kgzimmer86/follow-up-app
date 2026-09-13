-- READ ONLY: run in production ghsoqsuotjhfetbkbsdr before either Community migration.
-- Returns structure checks only; no contact records or function bodies are shown.
-- All PASS results are prerequisites, not a restore test or deployment approval.
BEGIN TRANSACTION READ ONLY;

WITH required_columns(table_name, column_names) AS (
  VALUES
    ('follow_up_campaigns', ARRAY['id','status','starts_on','ends_on']),
    ('ministry_areas', ARRAY['id','parent_id','is_active']),
    ('profiles', ARRAY['id','role','is_active']),
    ('students', ARRAY['id','phone','gender_raw']),
    ('profile_ministry_area_assignments', ARRAY['profile_id','campaign_id','is_default','ministry_area_id']),
    ('follow_up_contacts', ARRAY['id','campaign_id','student_id','phone','gender_raw','contact_origin','field_added_by','location_resolution','status']),
    ('follow_up_contact_merge_log', ARRAY['kept_student_id','merged_student_id'])
), missing_columns AS (
  SELECT r.table_name, wanted.column_name
  FROM required_columns r
  CROSS JOIN LATERAL unnest(r.column_names) AS wanted(column_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = to_regclass('public.' || r.table_name)
      AND a.attname = wanted.column_name AND a.attnum > 0 AND NOT a.attisdropped
  )
), source_functions AS (
  SELECT pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_follow_up_contact_results_v2'
    AND p.prokind = 'f' AND 'p_spreadsheet_status' = ANY(p.proargnames)
), markers AS (
  SELECT E'  with base as (\n' AS guard_marker,
         'where c.campaign_id = v_campaign_id'::text AS scope_marker
), checks(number, check_name, passed) AS (
  SELECT 1, 'Required schemas and roles exist',
    to_regnamespace('private') IS NOT NULL
    AND to_regprocedure('auth.uid()') IS NOT NULL
    AND to_regprocedure('gen_random_uuid()') IS NOT NULL
    AND (SELECT count(*) = 2 FROM pg_roles WHERE rolname IN ('anon','authenticated'))
  UNION ALL
  SELECT 2, 'Required existing tables and columns exist',
    NOT EXISTS (SELECT 1 FROM missing_columns)
  UNION ALL
  SELECT 3, 'No Community tables or membership index already installed',
    NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN (
        'community_groups','community_group_leaders','community_group_memberships',
        'community_group_meetings','community_group_attendance','community_group_one_active_membership'
      )
    )
  UNION ALL
  SELECT 4, 'No Community functions or merge trigger already installed',
    NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname IN ('public','private') AND p.proname IN (
        'community_area_allowed','can_access_community_group','save_community_group_attendance',
        'community_require_group','community_save_group','community_add_member',
        'community_member_action','community_on_contact_merge','get_community_contact_results'
      )
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = to_regclass('public.follow_up_contact_merge_log')
        AND tgname = 'community_transfer_on_merge'
    )
  UNION ALL
  SELECT 5, 'Existing shared status function exists',
    to_regprocedure('public.set_follow_up_contact_status(uuid,text)') IS NOT NULL
  UNION ALL
  SELECT 6, 'Exactly one compatible contact-results candidate exists',
    (SELECT count(*) = 1 FROM source_functions)
  UNION ALL
  SELECT 7, 'Contact-results definition passes migration shape guards',
    (SELECT count(*) = 1 FROM source_functions s CROSS JOIN markers m
      WHERE position('SECURITY DEFINER' IN s.definition) > 0
        AND position('public.get_follow_up_contact_results_v2(p_view text' IN s.definition) > 0
        AND (length(s.definition) - length(replace(s.definition,m.guard_marker,''))) / length(m.guard_marker) = 1
        AND (length(s.definition) - length(replace(s.definition,m.scope_marker,''))) / length(m.scope_marker) = 1)
  UNION ALL
  SELECT 8, 'Contacts enforce one record per campaign and student',
    EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = to_regclass('public.follow_up_contacts')
        AND i.indisunique AND i.indisvalid AND i.indimmediate
        AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts = 2
        AND ARRAY(
          SELECT a.attname::text
          FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
          WHERE k.ord <= i.indnkeyatts ORDER BY a.attname
        ) = ARRAY['campaign_id','student_id']
    )
)
SELECT number, check_name, CASE WHEN passed THEN 'PASS' ELSE 'STOP' END AS result
FROM checks ORDER BY number;

COMMIT;
