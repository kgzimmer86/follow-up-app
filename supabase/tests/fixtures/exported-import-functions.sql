CREATE OR REPLACE FUNCTION public.admin_archive_follow_up_campaign(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_campaign public.follow_up_campaigns%rowtype;
begin
  -- Must be signed in.
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  -- Only an active Admin may archive a Follow Up campaign.
  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.is_active = true
      and p.role::text = 'admin'
  ) then
    raise exception 'Admin access is required to archive a Follow Up campaign.';
  end if;

  -- Lock the campaign row while we verify and archive it.
  select *
  into v_campaign
  from public.follow_up_campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception 'Follow Up campaign not found.';
  end if;

  if v_campaign.status <> 'active' then
    raise exception 'Only the active Follow Up campaign can be archived.';
  end if;

  -- Archive the campaign.
  -- Keep its underlying Follow Up data intact.
  update public.follow_up_campaigns
  set
    status = 'archived',
    archived_at = now(),
    purge_after = (v_campaign.ends_on + interval '5 years')::date,
    updated_at = now()
  where id = p_campaign_id;

  return jsonb_build_object(
    'id', v_campaign.id,
    'academic_year', v_campaign.academic_year,
    'label', v_campaign.label,
    'status', 'archived',
    'archived_at', now(),
    'purge_after',
      (v_campaign.ends_on + interval '5 years')::date
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.import_survey_rows_v2(p_campaign_id uuid, p_filename text, p_source_headers jsonb, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_campaign_id uuid;
  v_import_id uuid;

  v_item jsonb;
  v_action text;
  v_skip_reason text;
  v_row_number integer;
  v_raw_data jsonb;
  v_issues jsonb;

  v_name text;
  v_uniqname text;
  v_email text;
  v_phone_digits text;
  v_gender text;
  v_year text;
  v_location text;
  v_house text;
  v_room text;
  v_jesus text;
  v_community text;
  v_interview text;
  v_submitted_at timestamptz;

  v_student_id uuid;
  v_uniq_student_id uuid;
  v_phone_student_ids uuid[];
  v_phone_match_count integer;
  v_existing_student_uniqname text;

  v_location_id uuid;
  v_affinity_name text;
  v_affinity_id uuid;

  v_contact_id uuid;

  -- Weak field-added match / explicit merge path.
  v_merge_contact_id uuid;
  v_merge_target_contact public.follow_up_contacts%rowtype;
  v_merge_target_student public.students%rowtype;
  v_temp_student_id uuid;
  v_temp_contact_id uuid;
  v_merge_result jsonb;

  v_total_count integer := 0;
  v_imported_count integer := 0;
  v_skipped_count integer := 0;
  v_issue_count integer := 0;
  v_students_created integer := 0;
  v_students_reused integer := 0;
  v_contacts_created integer := 0;
  v_contacts_updated integer := 0;
  v_contacts_merged integer := 0;
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  select p.role
  into v_user_role
  from public.profiles p
  where p.id = v_user_id
    and p.is_active = true;

  if v_user_role is distinct from 'admin' then
    raise exception 'Admin access required';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import rows must be a JSON array';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception 'There are no rows to import';
  end if;

  select c.id
  into v_campaign_id
  from public.follow_up_campaigns c
  where c.id = p_campaign_id
    and c.status in ('active', 'draft')
  limit 1;

  if v_campaign_id is null then
    raise exception 'Choose an active or draft Follow Up campaign';
  end if;

  insert into public.survey_imports (
    campaign_id,
    filename,
    source_kind,
    status,
    source_headers,
    total_rows,
    imported_rows,
    issue_rows,
    imported_by
  )
  values (
    v_campaign_id,
    coalesce(nullif(btrim(p_filename), ''), 'survey-import.csv'),
    'csv',
    'validated',
    coalesce(p_source_headers, '[]'::jsonb),
    jsonb_array_length(p_rows),
    0,
    0,
    v_user_id
  )
  returning id
  into v_import_id;

  for v_item in
    select value
    from jsonb_array_elements(p_rows)
  loop
    v_total_count := v_total_count + 1;

    v_row_number :=
      coalesce(
        nullif(v_item ->> 'row_number', '')::integer,
        v_total_count + 1
      );

    v_action :=
      lower(
        coalesce(
          nullif(btrim(v_item ->> 'action'), ''),
          'import'
        )
      );

    v_skip_reason :=
      nullif(
        btrim(
          coalesce(
            v_item ->> 'skip_reason',
            ''
          )
        ),
        ''
      );

    v_raw_data :=
      coalesce(
        v_item -> 'raw_data',
        '{}'::jsonb
      );

    v_issues :=
      case
        when jsonb_typeof(v_item -> 'issues') = 'array'
          then v_item -> 'issues'
        else '[]'::jsonb
      end;

    if jsonb_array_length(v_issues) > 0 then
      v_issue_count := v_issue_count + 1;
    end if;

    if v_action = 'skip' then
      insert into public.survey_import_rows (
        import_id,
        row_number,
        raw_data,
        normalized_data,
        issues,
        resolution_status
      )
      values (
        v_import_id,
        v_row_number,
        v_raw_data,
        v_item - 'raw_data',
        case
          when v_skip_reason is null
            then v_issues
          else v_issues || jsonb_build_array(v_skip_reason)
        end,
        'skipped'
      );

      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    if v_action not in ('import', 'update_existing', 'merge_into_existing') then
      raise exception
        'Row % has unsupported action "%"',
        v_row_number,
        v_action;
    end if;

    v_name :=
      btrim(
        coalesce(
          v_item ->> 'name',
          ''
        )
      );

    v_uniqname :=
      lower(
        split_part(
          regexp_replace(
            btrim(
              coalesce(
                v_item ->> 'uniqname',
                ''
              )
            ),
            '\s+',
            '',
            'g'
          ),
          '@',
          1
        )
      );

    v_uniqname :=
      regexp_replace(
        v_uniqname,
        '[^a-z0-9._-]',
        '',
        'g'
      );

    if v_uniqname = '' then
      v_uniqname := null;
    end if;

    v_email :=
      case
        when v_uniqname is null
          then null
        else v_uniqname || '@umich.edu'
      end;

    v_phone_digits :=
      regexp_replace(
        coalesce(
          v_item ->> 'phone',
          ''
        ),
        '[^0-9]',
        '',
        'g'
      );

    if
      length(v_phone_digits) = 11
      and left(v_phone_digits, 1) = '1'
    then
      v_phone_digits :=
        right(v_phone_digits, 10);
    elsif length(v_phone_digits) >= 10 then
      v_phone_digits :=
        right(v_phone_digits, 10);
    end if;

    if v_phone_digits = '' then
      v_phone_digits := null;
    end if;

    v_gender :=
      nullif(
        btrim(
          coalesce(
            v_item ->> 'gender',
            ''
          )
        ),
        ''
      );

    v_year :=
      nullif(
        btrim(
          coalesce(
            v_item ->> 'year_at_um',
            ''
          )
        ),
        ''
      );

    v_location :=
      nullif(
        btrim(
          coalesce(
            v_item ->> 'location',
            ''
          )
        ),
        ''
      );

    v_house :=
      nullif(
        btrim(
          coalesce(
            v_item ->> 'house_name',
            ''
          )
        ),
        ''
      );

    v_room :=
      nullif(
        btrim(
          coalesce(
            v_item ->> 'room_or_address',
            ''
          )
        ),
        ''
      );

    v_jesus :=
      nullif(
        lower(
          btrim(
            coalesce(
              v_item ->> 'jesus_interest',
              ''
            )
          )
        ),
        ''
      );

    v_community :=
      nullif(
        lower(
          btrim(
            coalesce(
              v_item ->> 'community_interest',
              ''
            )
          )
        ),
        ''
      );

    v_interview :=
      nullif(
        lower(
          btrim(
            coalesce(
              v_item ->> 'interview_interest',
              ''
            )
          )
        ),
        ''
      );

    if
      v_jesus is not null
      and v_jesus not in (
        'yes',
        'no',
        'maybe',
        'already_have_one'
      )
    then
      raise exception
        'Row % has invalid Jesus-interest value "%"',
        v_row_number,
        v_jesus;
    end if;

    if
      v_community is not null
      and v_community not in (
        'yes',
        'no',
        'maybe'
      )
    then
      raise exception
        'Row % has invalid community-interest value "%"',
        v_row_number,
        v_community;
    end if;

    if
      v_interview is not null
      and v_interview not in (
        'yes',
        'no',
        'maybe'
      )
    then
      raise exception
        'Row % has invalid interview-interest value "%"',
        v_row_number,
        v_interview;
    end if;

    v_submitted_at := null;

    begin
      if
        nullif(
          btrim(
            coalesce(
              v_item ->> 'survey_submitted_at',
              ''
            )
          ),
          ''
        ) is not null
      then
        v_submitted_at :=
          (v_item ->> 'survey_submitted_at')::timestamptz;
      end if;
    exception
      when others then
        v_submitted_at := null;
    end;

    -- Resolve the location before writing anything for this row.
    v_location_id := null;

    if v_location is not null then
      select a.id
      into v_location_id
      from public.ministry_areas a
      where a.is_active = true
        and a.area_type <> 'affinity'
        and lower(a.name) = lower(v_location)
      limit 1;

      if v_location_id is null then
        raise exception
          'Row % has unresolved ministry location "%"',
          v_row_number,
          v_location;
      end if;
    end if;

    -- ----------------------------------------------------------
    -- Explicit weak-match merge selected in the import review.
    --
    -- The incoming survey row is materialized as a short-lived survey
    -- contact, then the already field-added contact is kept as the survivor.
    -- This uses the same safe merge engine already field-tested in the
    -- contact-edit duplicate workflow.
    -- ----------------------------------------------------------
    if v_action = 'merge_into_existing' then
      begin
        v_merge_contact_id :=
          nullif(
            btrim(
              coalesce(
                v_item ->> 'merge_contact_id',
                ''
              )
            ),
            ''
          )::uuid;
      exception
        when others then
          v_merge_contact_id := null;
      end;

      if v_merge_contact_id is null then
        raise exception
          'Row % was marked to merge, but no valid existing contact was supplied. Run the database check again.',
          v_row_number;
      end if;

      select c.*
      into v_merge_target_contact
      from public.follow_up_contacts c
      where c.id = v_merge_contact_id
        and c.campaign_id = v_campaign_id
      for update;

      if not found then
        raise exception
          'Row % merge target is no longer in the selected campaign. Run the database check again.',
          v_row_number;
      end if;

      if v_merge_target_contact.contact_origin <> 'field_added' then
        raise exception
          'Row % merge target is no longer a field-added contact. Run the database check again.',
          v_row_number;
      end if;

      select s.*
      into v_merge_target_student
      from public.students s
      where s.id = v_merge_target_contact.student_id
      for update;

      if not found then
        raise exception
          'Row % merge target student could not be found.',
          v_row_number;
      end if;

      -- Weak matching is human-review-only:
      -- same location + same room/address + compatible name.
      if
        v_name = ''
        or v_location_id is null
        or v_room is null
        or v_merge_target_contact.ministry_location_id is distinct from v_location_id
        or private.follow_up_normalize_match_text(
             v_merge_target_contact.room_or_address
           ) is distinct from
           private.follow_up_normalize_match_text(v_room)
        or not private.follow_up_names_weakly_compatible(
             v_merge_target_student.display_name,
             v_name
           )
      then
        raise exception
          'Row % no longer matches the reviewed field-added contact by name + location + room. Run the database check again.',
          v_row_number;
      end if;

      -- Different established U-M identities are too strong a contradiction
      -- for a weak-match importer merge.
      if
        private.follow_up_normalize_uniqname(
          coalesce(
            nullif(
              btrim(
                coalesce(
                  v_merge_target_student.uniqname,
                  ''
                )
              ),
              ''
            ),
            v_merge_target_student.umich_email
          )
        ) is not null
        and v_uniqname is not null
        and private.follow_up_normalize_uniqname(
              coalesce(
                nullif(
                  btrim(
                    coalesce(
                      v_merge_target_student.uniqname,
                      ''
                    )
                  ),
                  ''
                ),
                v_merge_target_student.umich_email
              )
            ) <> v_uniqname
      then
        raise exception
          'Row % has a U-M identity conflict with the reviewed field-added contact. No merge was performed.',
          v_row_number;
      end if;

      -- If a stronger identity signal appeared after preview, stop instead of
      -- allowing a stale weak-match decision to override it.
      if
        v_uniqname is not null
        and exists (
          select 1
          from public.students s
          where s.id <> v_merge_target_student.id
            and (
              lower(
                btrim(
                  coalesce(
                    s.uniqname,
                    ''
                  )
                )
              ) = v_uniqname
              or lower(
                btrim(
                  coalesce(
                    s.umich_email,
                    ''
                  )
                )
              ) = v_email
            )
        )
      then
        raise exception
          'Row % U-M identity now belongs to another student. Run the database check again.',
          v_row_number;
      end if;

      if
        v_phone_digits is not null
        and exists (
          select 1
          from public.follow_up_contacts c
          where c.student_id <> v_merge_target_student.id
            and private.follow_up_normalize_phone(
                  c.phone
                ) = v_phone_digits
        )
      then
        raise exception
          'Row % phone now belongs to another student. Run the database check again.',
          v_row_number;
      end if;

      -- Short-lived survey-side record. The safe merge function keeps the
      -- field-added contact ID/history and prefers these survey/profile values.
      insert into public.students (
        uniqname,
        umich_email,
        display_name,
        phone,
        gender_raw
      )
      values (
        v_uniqname,
        v_email,
        v_name,
        v_phone_digits,
        v_gender
      )
      returning id
      into v_temp_student_id;

      insert into public.follow_up_contacts (
        campaign_id,
        student_id,
        survey_submitted_at,
        year_at_um,
        gender_raw,
        phone,
        interview_interest,
        jesus_interest,
        community_interest,
        raw_location_text,
        ministry_location_id,
        location_resolution,
        house_name,
        room_or_address,
        contact_origin
      )
      values (
        v_campaign_id,
        v_temp_student_id,
        v_submitted_at,
        v_year,
        v_gender,
        v_phone_digits,
        v_interview,
        v_jesus,
        v_community,
        v_location,
        v_location_id,
        case
          when v_location_id is null
            then 'no_address'
          else 'resolved'
        end,
        v_house,
        v_room,
        'survey'
      )
      returning id
      into v_temp_contact_id;

      if jsonb_typeof(v_item -> 'affinities') = 'array' then
        for v_affinity_name in
          select value
          from jsonb_array_elements_text(
            v_item -> 'affinities'
          )
        loop
          select a.id
          into v_affinity_id
          from public.ministry_areas a
          where a.is_active = true
            and a.area_type = 'affinity'
            and lower(a.name) =
              lower(
                btrim(
                  v_affinity_name
                )
              )
          limit 1;

          if v_affinity_id is null then
            raise exception
              'Row % has unresolved affinity "%"',
              v_row_number,
              v_affinity_name;
          end if;

          insert into public.follow_up_contact_affinities (
            contact_id,
            ministry_area_id
          )
          values (
            v_temp_contact_id,
            v_affinity_id
          )
          on conflict (
            contact_id,
            ministry_area_id
          )
          do nothing;
        end loop;
      end if;

      v_merge_result :=
        public.merge_follow_up_contacts(
          p_keep_contact_id =>
            v_merge_target_contact.id,
          p_merge_contact_id =>
            v_temp_contact_id,
          p_prefer_contact_id =>
            v_temp_contact_id,
          p_match_basis =>
            'survey_import_name_location_room'
        );

      insert into public.survey_import_rows (
        import_id,
        row_number,
        raw_data,
        normalized_data,
        issues,
        resolution_status,
        follow_up_contact_id
      )
      values (
        v_import_id,
        v_row_number,
        v_raw_data,
        v_item - 'raw_data',
        v_issues,
        'imported',
        v_merge_target_contact.id
      );

      v_students_reused :=
        v_students_reused + 1;

      v_contacts_updated :=
        v_contacts_updated + 1;

      v_contacts_merged :=
        v_contacts_merged + 1;

      v_imported_count :=
        v_imported_count + 1;

      continue;
    end if;

    -- Resolve identity using uniqname first and phone as a cross-check / fallback.
    v_student_id := null;
    v_uniq_student_id := null;
    v_phone_student_ids := '{}'::uuid[];
    v_phone_match_count := 0;
    v_existing_student_uniqname := null;

    if v_uniqname is not null then
      select s.id
      into v_uniq_student_id
      from public.students s
      where lower(coalesce(s.uniqname, '')) = v_uniqname
      limit 1;
    end if;

    if v_phone_digits is not null then
      select
        coalesce(
          array_agg(distinct c.student_id),
          '{}'::uuid[]
        )
      into v_phone_student_ids
      from public.follow_up_contacts c
      where (
        case
          when
            length(
              regexp_replace(
                coalesce(c.phone, ''),
                '[^0-9]',
                '',
                'g'
              )
            ) = 11
            and left(
              regexp_replace(
                coalesce(c.phone, ''),
                '[^0-9]',
                '',
                'g'
              ),
              1
            ) = '1'
          then right(
            regexp_replace(
              coalesce(c.phone, ''),
              '[^0-9]',
              '',
              'g'
            ),
            10
          )
          when length(
            regexp_replace(
              coalesce(c.phone, ''),
              '[^0-9]',
              '',
              'g'
            )
          ) >= 10
          then right(
            regexp_replace(
              coalesce(c.phone, ''),
              '[^0-9]',
              '',
              'g'
            ),
            10
          )
          else regexp_replace(
            coalesce(c.phone, ''),
            '[^0-9]',
            '',
            'g'
          )
        end
      ) = v_phone_digits;

      v_phone_match_count :=
        cardinality(v_phone_student_ids);
    end if;

    if v_uniq_student_id is not null then
      if
        v_phone_match_count > 0
        and not (
          v_uniq_student_id =
          any(v_phone_student_ids)
        )
      then
        raise exception
          'Row % has an identity conflict: uniqname and phone point to different students',
          v_row_number;
      end if;

      if v_phone_match_count > 1 then
        raise exception
          'Row % phone matches multiple existing students',
          v_row_number;
      end if;

      v_student_id :=
        v_uniq_student_id;

      v_students_reused :=
        v_students_reused + 1;
    elsif v_phone_match_count = 1 then
      v_student_id :=
        v_phone_student_ids[1];

      select s.uniqname
      into v_existing_student_uniqname
      from public.students s
      where s.id = v_student_id;

      if
        v_uniqname is not null
        and nullif(
          lower(
            btrim(
              coalesce(
                v_existing_student_uniqname,
                ''
              )
            )
          ),
          ''
        ) is not null
        and lower(
          btrim(
            v_existing_student_uniqname
          )
        ) <> v_uniqname
      then
        raise exception
          'Row % has an identity conflict: phone belongs to a student with uniqname "%"',
          v_row_number,
          v_existing_student_uniqname;
      end if;

      v_students_reused :=
        v_students_reused + 1;
    elsif v_phone_match_count > 1 then
      raise exception
        'Row % phone matches multiple existing students',
        v_row_number;
    else
      insert into public.students (
        uniqname,
        umich_email,
        display_name,
        phone,
        gender_raw
      )
      values (
        v_uniqname,
        v_email,
        v_name,
        v_phone_digits,
        v_gender
      )
      returning id
      into v_student_id;

      v_students_created :=
        v_students_created + 1;
    end if;

    -- Existing campaign contact: keep it by default. If the reviewer
    -- explicitly chose the newer survey response, refresh only survey/contact
    -- fields. Follow Up status, assignment, knocks, interactions, history,
    -- and ministry-progress timestamps remain untouched.
    v_contact_id := null;

    select c.id
    into v_contact_id
    from public.follow_up_contacts c
    where c.campaign_id = v_campaign_id
      and c.student_id = v_student_id
    limit 1;

    if v_contact_id is not null then
      if v_action = 'update_existing' then
          -- Add useful identity data without overwriting established values.
          update public.students s
          set
            uniqname =
              case
                when
                  nullif(
                    btrim(
                      coalesce(
                        s.uniqname,
                        ''
                      )
                    ),
                    ''
                  ) is null
                then coalesce(
                  v_uniqname,
                  s.uniqname
                )
                else s.uniqname
              end,
            umich_email =
              case
                when
                  nullif(
                    btrim(
                      coalesce(
                        s.umich_email,
                        ''
                      )
                    ),
                    ''
                  ) is null
                then coalesce(
                  v_email,
                  s.umich_email
                )
                else s.umich_email
              end,
            display_name =
              case
                when
                  btrim(
                    coalesce(
                      s.display_name,
                      ''
                    )
                  ) = ''
                  and v_name <> ''
                then v_name
                else s.display_name
              end,
            phone =
              case
                when
                  nullif(
                    btrim(
                      coalesce(
                        s.phone,
                        ''
                      )
                    ),
                    ''
                  ) is null
                then coalesce(
                  v_phone_digits,
                  s.phone
                )
                else s.phone
              end,
            gender_raw =
              case
                when
                  nullif(
                    btrim(
                      coalesce(
                        s.gender_raw,
                        ''
                      )
                    ),
                    ''
                  ) is null
                then coalesce(
                  v_gender,
                  s.gender_raw
                )
                else s.gender_raw
              end,
            updated_at = now()
          where s.id = v_student_id;

        update public.follow_up_contacts c
        set
          survey_submitted_at =
            coalesce(
              v_submitted_at,
              c.survey_submitted_at
            ),
          year_at_um =
            coalesce(
              v_year,
              c.year_at_um
            ),
          gender_raw =
            coalesce(
              v_gender,
              c.gender_raw
            ),
          phone =
            coalesce(
              v_phone_digits,
              c.phone
            ),
          interview_interest =
            coalesce(
              v_interview,
              c.interview_interest
            ),
          jesus_interest =
            coalesce(
              v_jesus,
              c.jesus_interest
            ),
          community_interest =
            coalesce(
              v_community,
              c.community_interest
            ),
          raw_location_text =
            coalesce(
              v_location,
              c.raw_location_text
            ),
          ministry_location_id =
            coalesce(
              v_location_id,
              c.ministry_location_id
            ),
          location_resolution =
            case
              when v_location_id is not null
                then 'resolved'
              else c.location_resolution
            end,
          house_name =
            coalesce(
              v_house,
              c.house_name
            ),
          room_or_address =
            coalesce(
              v_room,
              c.room_or_address
            ),
          updated_at = now()
        where c.id = v_contact_id;

        -- When the newer CSV actually includes the affinities question,
        -- treat its selections as authoritative for this survey refresh.
        -- This removes old affinity selections that are no longer present while
        -- leaving affinities untouched if the CSV did not include that column.
        if coalesce(
          lower(v_item ->> 'affinities_supplied') = 'true',
          false
        ) then
          if jsonb_typeof(v_item -> 'affinities') <> 'array' then
            raise exception
              'Row % supplied affinities in an invalid format',
              v_row_number;
          end if;

          delete from public.follow_up_contact_affinities
          where contact_id = v_contact_id;

          for v_affinity_name in
            select value
            from jsonb_array_elements_text(
              v_item -> 'affinities'
            )
          loop
            select a.id
            into v_affinity_id
            from public.ministry_areas a
            where a.is_active = true
              and a.area_type = 'affinity'
              and lower(a.name) =
                lower(
                  btrim(
                    v_affinity_name
                  )
                )
            limit 1;

            if v_affinity_id is null then
              raise exception
                'Row % has unresolved affinity "%"',
                v_row_number,
                v_affinity_name;
            end if;

            insert into public.follow_up_contact_affinities (
              contact_id,
              ministry_area_id
            )
            values (
              v_contact_id,
              v_affinity_id
            )
            on conflict (
              contact_id,
              ministry_area_id
            )
            do nothing;
          end loop;
        end if;

        insert into public.survey_import_rows (
          import_id,
          row_number,
          raw_data,
          normalized_data,
          issues,
          resolution_status,
          follow_up_contact_id
        )
        values (
          v_import_id,
          v_row_number,
          v_raw_data,
          v_item - 'raw_data',
          v_issues,
          'imported',
          v_contact_id
        );

        v_contacts_updated :=
          v_contacts_updated + 1;

        v_imported_count :=
          v_imported_count + 1;

        continue;
      end if;

      insert into public.survey_import_rows (
        import_id,
        row_number,
        raw_data,
        normalized_data,
        issues,
        resolution_status,
        follow_up_contact_id
      )
      values (
        v_import_id,
        v_row_number,
        v_raw_data,
        v_item - 'raw_data',
        v_issues || jsonb_build_array('Already in selected campaign; existing contact left unchanged'),
        'skipped',
        v_contact_id
      );

      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    if v_action = 'update_existing' then
      raise exception
        'Row % was marked to use the newer survey response, but the existing campaign contact could not be found. Run the database check again.',
        v_row_number;
    end if;

    -- Add useful identity data without overwriting established values.
    update public.students s
    set
      uniqname =
        case
          when
            nullif(
              btrim(
                coalesce(
                  s.uniqname,
                  ''
                )
              ),
              ''
            ) is null
          then coalesce(
            v_uniqname,
            s.uniqname
          )
          else s.uniqname
        end,
      umich_email =
        case
          when
            nullif(
              btrim(
                coalesce(
                  s.umich_email,
                  ''
                )
              ),
              ''
            ) is null
          then coalesce(
            v_email,
            s.umich_email
          )
          else s.umich_email
        end,
      display_name =
        case
          when
            btrim(
              coalesce(
                s.display_name,
                ''
              )
            ) = ''
            and v_name <> ''
          then v_name
          else s.display_name
        end,
      phone =
        case
          when
            nullif(
              btrim(
                coalesce(
                  s.phone,
                  ''
                )
              ),
              ''
            ) is null
          then coalesce(
            v_phone_digits,
            s.phone
          )
          else s.phone
        end,
      gender_raw =
        case
          when
            nullif(
              btrim(
                coalesce(
                  s.gender_raw,
                  ''
                )
              ),
              ''
            ) is null
          then coalesce(
            v_gender,
            s.gender_raw
          )
          else s.gender_raw
        end,
      updated_at = now()
    where s.id = v_student_id;

    -- The selected campaign was checked above. At this point the student is
    -- not already in the campaign, so create a new campaign contact only.
    v_contact_id := null;

    insert into public.follow_up_contacts (
      campaign_id,
      student_id,
      survey_submitted_at,
      year_at_um,
      gender_raw,
      phone,
      interview_interest,
      jesus_interest,
      community_interest,
      raw_location_text,
      ministry_location_id,
      location_resolution,
      house_name,
      room_or_address
    )
    values (
      v_campaign_id,
      v_student_id,
      v_submitted_at,
      v_year,
      v_gender,
      v_phone_digits,
      v_interview,
      v_jesus,
      v_community,
      v_location,
      v_location_id,
      case
        when v_location_id is null
          then 'no_address'
        else 'resolved'
      end,
      v_house,
      v_room
    )
    on conflict (campaign_id, student_id)
    do nothing
    returning id
    into v_contact_id;

    -- A concurrent import may have created this same campaign contact after
    -- the preview/check above. Treat that race exactly like any other existing
    -- campaign contact: preserve it and record this source row as skipped.
    if v_contact_id is null then
      select c.id
      into v_contact_id
      from public.follow_up_contacts c
      where c.campaign_id = v_campaign_id
        and c.student_id = v_student_id
      limit 1;

      insert into public.survey_import_rows (
        import_id,
        row_number,
        raw_data,
        normalized_data,
        issues,
        resolution_status,
        follow_up_contact_id
      )
      values (
        v_import_id,
        v_row_number,
        v_raw_data,
        v_item - 'raw_data',
        v_issues || jsonb_build_array('Already in selected campaign; existing contact left unchanged'),
        'skipped',
        v_contact_id
      );

      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    v_contacts_created :=
      v_contacts_created + 1;

    -- Add any contextualized ministry affinities present on the survey.
    if
      jsonb_typeof(
        v_item -> 'affinities'
      ) = 'array'
    then
      for v_affinity_name in
        select value
        from jsonb_array_elements_text(
          v_item -> 'affinities'
        )
      loop
        select a.id
        into v_affinity_id
        from public.ministry_areas a
        where a.is_active = true
          and a.area_type = 'affinity'
          and lower(a.name) =
            lower(
              btrim(
                v_affinity_name
              )
            )
        limit 1;

        if v_affinity_id is null then
          raise exception
            'Row % has unresolved affinity "%"',
            v_row_number,
            v_affinity_name;
        end if;

        insert into public.follow_up_contact_affinities (
          contact_id,
          ministry_area_id
        )
        values (
          v_contact_id,
          v_affinity_id
        )
        on conflict (
          contact_id,
          ministry_area_id
        )
        do nothing;
      end loop;
    end if;

    insert into public.survey_import_rows (
      import_id,
      row_number,
      raw_data,
      normalized_data,
      issues,
      resolution_status,
      follow_up_contact_id
    )
    values (
      v_import_id,
      v_row_number,
      v_raw_data,
      v_item - 'raw_data',
      v_issues,
      'imported',
      v_contact_id
    );

    v_imported_count :=
      v_imported_count + 1;
  end loop;

  update public.survey_imports i
  set
    status = 'imported',
    imported_rows =
      v_imported_count,
    issue_rows =
      v_issue_count,
    imported_at = now()
  where i.id = v_import_id;

  return jsonb_build_object(
    'import_id',
    v_import_id,
    'campaign_id',
    v_campaign_id,
    'total_rows',
    v_total_count,
    'imported_rows',
    v_imported_count,
    'skipped_rows',
    v_skipped_count,
    'issue_rows',
    v_issue_count,
    'students_created',
    v_students_created,
    'students_reused',
    v_students_reused,
    'contacts_created',
    v_contacts_created,
    'contacts_updated',
    v_contacts_updated,
    'contacts_merged',
    v_contacts_merged
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_follow_up_contact_status(p_contact_id uuid, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and role <> 'pending'
  ) then
    raise exception 'Active Follow Up access required';
  end if;

  if p_status not in (
    'uncontacted',
    'attempted_contact',
    'go_back',
    'involved',
    'not_interested'
  ) then
    raise exception 'Invalid Follow Up status';
  end if;

  if not exists (
    select 1
    from public.follow_up_contacts contact
    join public.follow_up_campaigns campaign
      on campaign.id = contact.campaign_id
    where contact.id = p_contact_id
      and campaign.status = 'active'
  ) then
    raise exception 'Contact is not part of the active Follow Up campaign';
  end if;

  update public.follow_up_contacts
  set
    status = p_status,
    updated_at = now()
  where id = p_contact_id;
end;
$function$;
