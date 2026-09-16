-- Installed matching functions exported for regression tests; no user records.
CREATE OR REPLACE FUNCTION private.follow_up_normalize_match_text(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select nullif(
    regexp_replace(
      lower(btrim(coalesce(p_value, ''))),
      '\s+',
      ' ',
      'g'
    ),
    ''
  );
$function$;

CREATE OR REPLACE FUNCTION private.follow_up_names_weakly_compatible(p_left text, p_right text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  with names as (
    select
      private.follow_up_normalize_match_text(p_left) as left_name,
      private.follow_up_normalize_match_text(p_right) as right_name
  )
  select
    left_name is not null
    and right_name is not null
    and (
      left_name = right_name
      or (
        split_part(left_name, ' ', 1) =
          split_part(right_name, ' ', 1)
        and (
          position(' ' in left_name) = 0
          or position(' ' in right_name) = 0
        )
      )
    )
  from names;
$function$;

CREATE OR REPLACE FUNCTION private.follow_up_normalize_phone(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_digits text :=
    regexp_replace(
      coalesce(p_value, ''),
      '[^0-9]',
      '',
      'g'
    );
begin
  if v_digits = '' then
    return null;
  end if;

  if
    length(v_digits) = 11
    and left(v_digits, 1) = '1'
  then
    v_digits := right(v_digits, 10);
  elsif length(v_digits) > 10 then
    v_digits := right(v_digits, 10);
  end if;

  if length(v_digits) <> 10 then
    return null;
  end if;

  return v_digits;
end;
$function$;

CREATE OR REPLACE FUNCTION private.follow_up_normalize_uniqname(p_value text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_value text :=
    lower(
      regexp_replace(
        btrim(coalesce(p_value, '')),
        '\s+',
        '',
        'g'
      )
    );
begin
  if v_value = '' then
    return null;
  end if;

  while
    v_value like '%@umich.edu@umich.edu'
  loop
    v_value :=
      regexp_replace(
        v_value,
        '@umich\.edu@umich\.edu$',
        '@umich.edu'
      );
  end loop;

  if position('@' in v_value) > 0 then
    if v_value !~ '^[a-z0-9._-]+@umich\.edu$' then
      return null;
    end if;

    v_value := split_part(v_value, '@', 1);
  end if;

  if v_value !~ '^[a-z0-9._-]+$' then
    return null;
  end if;

  return nullif(v_value, '');
end;
$function$;

CREATE OR REPLACE FUNCTION public.preview_survey_import_matches(p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  select p.role::text
  into v_user_role
  from public.profiles p
  where p.id = v_user_id
    and p.is_active = true;

  if v_user_role not in ('staff', 'admin') then
    raise exception 'Management access required';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Preview rows must be a JSON array';
  end if;

  with
  raw_rows as (
    select
      coalesce(
        nullif(item.value ->> 'row_number', '')::int,
        item.ordinality::int + 1
      ) as row_number,

      trim(
        coalesce(
          item.value ->> 'name',
          ''
        )
      ) as display_name,

      lower(
        split_part(
          trim(
            coalesce(
              item.value ->> 'uniqname',
              ''
            )
          ),
          '@',
          1
        )
      ) as uniqname,

      regexp_replace(
        coalesce(
          item.value ->> 'phone',
          ''
        ),
        '[^0-9]',
        '',
        'g'
      ) as phone_digits

    from jsonb_array_elements(p_rows)
      with ordinality as item(value, ordinality)
  ),

  input_rows as (
    select
      rr.row_number,
      rr.display_name,
      rr.uniqname,

      case
        when length(rr.phone_digits) = 11
          and left(rr.phone_digits, 1) = '1'
        then right(rr.phone_digits, 10)

        when length(rr.phone_digits) >= 10
        then right(rr.phone_digits, 10)

        else rr.phone_digits
      end as phone_normalized

    from raw_rows rr
  ),

  input_uniqnames as (
    select distinct r.uniqname
    from input_rows r
    where r.uniqname <> ''
  ),

  input_phones as (
    select distinct r.phone_normalized
    from input_rows r
    where r.phone_normalized <> ''
  ),

  uniqname_candidates as (
    select
      lower(coalesce(s.uniqname, '')) as uniqname,
      s.id as student_id,
      s.display_name::text as student_name,
      s.uniqname::text as student_uniqname

    from public.students s

    join input_uniqnames iu
      on iu.uniqname =
        lower(coalesce(s.uniqname, ''))
  ),

  uniqname_matches as (
    select
      c.uniqname,
      count(*)::int as match_count,
      (array_agg(
        c.student_id
        order by c.student_id::text
      ))[1] as student_id,
      (array_agg(
        c.student_name
        order by c.student_id::text
      ))[1] as student_name,
      (array_agg(
        c.student_uniqname
        order by c.student_id::text
      ))[1] as student_uniqname

    from uniqname_candidates c

    group by c.uniqname
  ),

  contact_phones as (
    select distinct
      c.student_id,
      s.display_name::text as student_name,
      s.uniqname::text as student_uniqname,

      case
        when length(phone_digits.value) = 11
          and left(phone_digits.value, 1) = '1'
        then right(phone_digits.value, 10)

        when length(phone_digits.value) >= 10
        then right(phone_digits.value, 10)

        else phone_digits.value
      end as phone_normalized

    from public.follow_up_contacts c

    join public.students s
      on s.id = c.student_id

    cross join lateral (
      select regexp_replace(
        coalesce(c.phone, ''),
        '[^0-9]',
        '',
        'g'
      ) as value
    ) phone_digits

    where c.phone is not null
      and btrim(c.phone) <> ''
  ),

  relevant_phone_candidates as (
    select
      cp.phone_normalized,
      cp.student_id,
      cp.student_name,
      cp.student_uniqname

    from contact_phones cp

    join input_phones ip
      on ip.phone_normalized =
        cp.phone_normalized

    where cp.phone_normalized <> ''
  ),

  phone_matches as (
    select
      c.phone_normalized,
      count(*)::int as match_count,
      (array_agg(
        c.student_id
        order by c.student_id::text
      ))[1] as student_id,
      (array_agg(
        c.student_name
        order by c.student_id::text
      ))[1] as student_name,
      (array_agg(
        c.student_uniqname
        order by c.student_id::text
      ))[1] as student_uniqname

    from relevant_phone_candidates c

    group by c.phone_normalized
  ),

  evaluated as (
    select
      r.*,

      coalesce(
        um.match_count,
        0
      )::int as uniqname_match_count,

      um.student_id
        as uniqname_student_id,

      um.student_name
        as uniqname_student_name,

      um.student_uniqname
        as matched_uniqname,

      coalesce(
        pm.match_count,
        0
      )::int as phone_match_count,

      pm.student_id
        as phone_student_id,

      pm.student_name
        as phone_student_name,

      pm.student_uniqname
        as phone_student_uniqname

    from input_rows r

    left join uniqname_matches um
      on um.uniqname = r.uniqname

    left join phone_matches pm
      on pm.phone_normalized =
        r.phone_normalized
  )

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'row_number',
          e.row_number,

        'name',
          e.display_name,

        'uniqname',
          nullif(e.uniqname, ''),

        'phone_normalized',
          nullif(
            e.phone_normalized,
            ''
          ),

        'status',
          case

            when
              e.uniqname_match_count > 1
            then
              'needs_review_duplicate_uniqname'

            when
              e.uniqname_match_count = 1
            then
              'matched_by_uniqname'

            when
              e.phone_match_count > 1
            then
              'needs_review_multiple_phone_matches'

            when
              e.uniqname <> ''
              and
              e.phone_match_count = 1
              and
              coalesce(
                e.phone_student_uniqname,
                ''
              ) = ''
            then
              'matched_by_phone_add_uniqname'

            when
              e.uniqname <> ''
              and
              e.phone_match_count = 1
              and
              lower(
                coalesce(
                  e.phone_student_uniqname,
                  ''
                )
              ) <> e.uniqname
            then
              'needs_review_identity_conflict'

            when
              e.uniqname = ''
              and
              e.phone_match_count = 1
            then
              'matched_by_phone'

            when
              e.uniqname = ''
              and
              e.phone_normalized = ''
            then
              'new_student_weak_identity'

            when
              e.uniqname = ''
            then
              'new_student_phone_only'

            else
              'new_student'
          end,

        'matched_student_id',
          case
            when
              e.uniqname_match_count = 1
            then
              e.uniqname_student_id

            when
              e.phone_match_count = 1
            then
              e.phone_student_id

            else
              null
          end,

        'matched_student_name',
          case
            when
              e.uniqname_match_count = 1
            then
              e.uniqname_student_name

            when
              e.phone_match_count = 1
            then
              e.phone_student_name

            else
              null
          end,

        'existing_uniqname',
          case
            when
              e.uniqname_match_count = 1
            then
              e.matched_uniqname

            when
              e.phone_match_count = 1
            then
              e.phone_student_uniqname

            else
              null
          end
      )

      order by e.row_number
    ),
    '[]'::jsonb
  )
  into v_result
  from evaluated e;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.preview_survey_import_weak_matches(p_campaign_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  select p.role::text
  into v_role
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true;

  if v_role not in ('staff', 'admin') then
    raise exception 'Management access required';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Preview rows must be a JSON array';
  end if;

  if not exists (
    select 1
    from public.follow_up_campaigns campaign
    where campaign.id = p_campaign_id
      and campaign.status in ('active', 'draft')
  ) then
    raise exception 'Choose an active or draft Follow Up campaign';
  end if;

  with input_rows as (
    select
      coalesce(
        nullif(item.value ->> 'row_number', '')::int,
        item.ordinality::int + 1
      ) as row_number,

      nullif(
        btrim(
          coalesce(
            item.value ->> 'name',
            ''
          )
        ),
        ''
      ) as display_name,

      nullif(
        btrim(
          coalesce(
            item.value ->> 'location',
            ''
          )
        ),
        ''
      ) as location_name,

      nullif(
        btrim(
          coalesce(
            item.value ->> 'room_or_address',
            ''
          )
        ),
        ''
      ) as room_or_address,

      private.follow_up_normalize_uniqname(
        item.value ->> 'uniqname'
      ) as incoming_uniqname,

      private.follow_up_normalize_phone(
        item.value ->> 'phone'
      ) as incoming_phone

    from jsonb_array_elements(p_rows)
      with ordinality as item(value, ordinality)
  ),

  resolved as (
    select
      r.*,
      area.id as location_id
    from input_rows r
    left join public.ministry_areas area
      on area.is_active = true
      and area.area_type <> 'affinity'
      and lower(area.name) =
        lower(r.location_name)
  ),

  candidate_rows as (
    select
      r.row_number,

      c.id as contact_id,
      c.student_id,
      s.display_name::text as candidate_name,
      s.uniqname::text as candidate_uniqname,
      s.umich_email::text as candidate_umich_email,

      coalesce(
        private.follow_up_normalize_phone(
          s.phone
        ),
        private.follow_up_normalize_phone(
          c.phone
        )
      ) as candidate_phone,

      c.contact_origin::text,
      c.status::text as follow_up_status,
      c.primary_owner_id,
      area.name::text as location_name,
      c.room_or_address::text,

      (
        r.incoming_uniqname is not null
        and private.follow_up_normalize_uniqname(
          coalesce(
            nullif(
              btrim(
                coalesce(
                  s.uniqname,
                  ''
                )
              ),
              ''
            ),
            s.umich_email
          )
        ) is not null
        and private.follow_up_normalize_uniqname(
          coalesce(
            nullif(
              btrim(
                coalesce(
                  s.uniqname,
                  ''
                )
              ),
              ''
            ),
            s.umich_email
          )
        ) <> r.incoming_uniqname
      ) as identity_conflict,

      (
        r.incoming_phone is not null
        and coalesce(
          private.follow_up_normalize_phone(
            s.phone
          ),
          private.follow_up_normalize_phone(
            c.phone
          )
        ) is not null
        and coalesce(
          private.follow_up_normalize_phone(
            s.phone
          ),
          private.follow_up_normalize_phone(
            c.phone
          )
        ) <> r.incoming_phone
      ) as phone_differs

    from resolved r
    join public.follow_up_contacts c
      on c.campaign_id = p_campaign_id
      and c.contact_origin = 'field_added'
      and c.ministry_location_id = r.location_id
      and private.follow_up_normalize_match_text(
            c.room_or_address
          ) =
          private.follow_up_normalize_match_text(
            r.room_or_address
          )

    join public.students s
      on s.id = c.student_id

    left join public.ministry_areas area
      on area.id = c.ministry_location_id

    where
      r.display_name is not null
      and r.location_id is not null
      and r.room_or_address is not null
      and private.follow_up_names_weakly_compatible(
            s.display_name,
            r.display_name
          )
  ),

  grouped as (
    select
      r.row_number,
      count(c.contact_id)::int as candidate_count,

      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'contact_id', c.contact_id,
            'student_id', c.student_id,
            'display_name', c.candidate_name,
            'uniqname', c.candidate_uniqname,
            'umich_email', c.candidate_umich_email,
            'phone', c.candidate_phone,
            'contact_origin', c.contact_origin,
            'follow_up_status', c.follow_up_status,
            'primary_owner_id', c.primary_owner_id,
            'location_name', c.location_name,
            'room_or_address', c.room_or_address,
            'identity_conflict', c.identity_conflict,
            'phone_differs', c.phone_differs,
            'match_reason', 'name_location_room'
          )
          order by
            c.identity_conflict,
            c.candidate_name,
            c.contact_id::text
        ) filter (
          where c.contact_id is not null
        ),
        '[]'::jsonb
      ) as candidates

    from input_rows r
    left join candidate_rows c
      on c.row_number = r.row_number
    group by r.row_number
  )

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'row_number', g.row_number,
        'candidate_count', g.candidate_count,
        'status',
          case
            when g.candidate_count = 0
              then 'no_weak_match'
            when g.candidate_count = 1
              then 'weak_match'
            else 'multiple_weak_matches'
          end,
        'candidates', g.candidates
      )
      order by g.row_number
    ),
    '[]'::jsonb
  )
  into v_result
  from grouped g;

  return v_result;
end;
$function$;
