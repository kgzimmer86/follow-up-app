-- Read-only Supabase export supplied by the product owner, September 11, 2026.
-- These are unmodified function bodies; only used in an isolated test database.
CREATE OR REPLACE FUNCTION public.create_field_added_contact(p_display_name text, p_phone text DEFAULT NULL::text, p_uniqname text DEFAULT NULL::text, p_source_contact_id uuid DEFAULT NULL::uuid, p_ministry_location_id uuid DEFAULT NULL::uuid, p_room_or_address text DEFAULT NULL::text, p_relationship text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;

  v_campaign_id uuid;

  v_name text :=
    nullif(
      btrim(coalesce(p_display_name, '')),
      ''
    );

  v_uniqname text :=
    nullif(
      lower(btrim(coalesce(p_uniqname, ''))),
      ''
    );

  v_phone_digits text :=
    regexp_replace(
      coalesce(p_phone, ''),
      '[^0-9]',
      '',
      'g'
    );

  v_phone text;

  v_source public.follow_up_contacts%rowtype;

  v_location_id uuid;
  v_raw_location_text text;
  v_house_name text;
  v_room_or_address text;
  v_location_resolution public.follow_up_contacts.location_resolution%type;

  v_uniq_student_id uuid;
  v_phone_student_ids uuid[] := '{}'::uuid[];
  v_phone_match_count integer := 0;
  v_student_id uuid;
  v_existing_uniqname text;
  v_existing_phone text;

  v_contact_id uuid;
  v_existing_contact_id uuid;
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

  if v_name is null then
    raise exception 'Name is required.';
  end if;

  -- Normalize an optional phone number to the same 10-digit identity
  -- shape used by the survey importer.
  if v_phone_digits <> '' then
    if length(v_phone_digits) = 11
       and left(v_phone_digits, 1) = '1' then
      v_phone := right(v_phone_digits, 10);
    elsif length(v_phone_digits) = 10 then
      v_phone := v_phone_digits;
    else
      raise exception
        'Enter a 10-digit phone number (or 11 digits beginning with 1).';
    end if;
  else
    v_phone := null;
  end if;

  -- Roommate flow: inherit campaign + location/room information
  -- from the existing contact they were met through.
  if p_source_contact_id is not null then
    select c.*
    into v_source
    from public.follow_up_contacts c
    join public.follow_up_campaigns campaign
      on campaign.id = c.campaign_id
    where c.id = p_source_contact_id
      and campaign.status::text = 'active';

    if not found then
      raise exception 'The source Follow Up contact was not found in the active campaign.';
    end if;

    v_campaign_id := v_source.campaign_id;

    v_location_id :=
      coalesce(
        p_ministry_location_id,
        v_source.ministry_location_id
      );

    v_raw_location_text :=
      v_source.raw_location_text;

    v_house_name :=
      v_source.house_name;

    v_room_or_address :=
      coalesce(
        nullif(
          btrim(
            coalesce(
              p_room_or_address,
              ''
            )
          ),
          ''
        ),
        v_source.room_or_address
      );

    if v_location_id is not null then
      v_location_resolution := 'resolved';
    else
      v_location_resolution :=
        coalesce(
          v_source.location_resolution,
          'no_address'
        );
    end if;

  else
    -- Future Add Person flow: use the active campaign and any
    -- explicitly supplied location information.
    select c.id
    into v_campaign_id
    from public.follow_up_campaigns c
    where c.status::text = 'active'
    order by c.created_at desc
    limit 1;

    if v_campaign_id is null then
      raise exception 'No active Follow Up campaign.';
    end if;

    v_location_id := p_ministry_location_id;

    v_room_or_address :=
      nullif(
        btrim(
          coalesce(
            p_room_or_address,
            ''
          )
        ),
        ''
      );

    if v_location_id is not null then
      if not exists (
        select 1
        from public.ministry_areas area
        where area.id = v_location_id
          and area.is_active = true
          and area.area_type::text <> 'affinity'
      ) then
        raise exception 'Choose an active campus/location area.';
      end if;

      select area.name::text
      into v_raw_location_text
      from public.ministry_areas area
      where area.id = v_location_id;

      v_location_resolution := 'resolved';
    else
      v_location_resolution := 'no_address';
    end if;
  end if;

  -- If the caller explicitly supplies a location override, validate it.
  if p_ministry_location_id is not null
     and not exists (
       select 1
       from public.ministry_areas area
       where area.id = p_ministry_location_id
         and area.is_active = true
         and area.area_type::text <> 'affinity'
     ) then
    raise exception 'Choose an active campus/location area.';
  end if;

  -- ----------------------------------------------------------
  -- Identity match: uniqname first, phone second.
  -- This prevents a field-added roommate from duplicating a
  -- student we already know.
  -- ----------------------------------------------------------

  if v_uniqname is not null then
    select s.id
    into v_uniq_student_id
    from public.students s
    where lower(btrim(coalesce(s.uniqname, ''))) =
      v_uniqname
    limit 1;
  end if;

  if v_phone is not null then
    select coalesce(
      array_agg(s.id order by s.id),
      '{}'::uuid[]
    )
    into v_phone_student_ids
    from public.students s
    where (
      case
        when length(
          regexp_replace(
            coalesce(s.phone, ''),
            '[^0-9]',
            '',
            'g'
          )
        ) = 11
        and left(
          regexp_replace(
            coalesce(s.phone, ''),
            '[^0-9]',
            '',
            'g'
          ),
          1
        ) = '1'
        then right(
          regexp_replace(
            coalesce(s.phone, ''),
            '[^0-9]',
            '',
            'g'
          ),
          10
        )
        when length(
          regexp_replace(
            coalesce(s.phone, ''),
            '[^0-9]',
            '',
            'g'
          )
        ) >= 10
        then right(
          regexp_replace(
            coalesce(s.phone, ''),
            '[^0-9]',
            '',
            'g'
          ),
          10
        )
        else regexp_replace(
          coalesce(s.phone, ''),
          '[^0-9]',
          '',
          'g'
        )
      end
    ) = v_phone;

    v_phone_match_count :=
      cardinality(v_phone_student_ids);
  end if;

  if v_uniq_student_id is not null then
    if v_phone_match_count > 0
       and not (
         v_uniq_student_id =
         any(v_phone_student_ids)
       ) then
      raise exception
        'That uniqname and phone number belong to different existing students.';
    end if;

    if v_phone_match_count > 1 then
      raise exception
        'That phone number matches multiple existing students.';
    end if;

    v_student_id := v_uniq_student_id;

  elsif v_phone_match_count = 1 then
    v_student_id := v_phone_student_ids[1];

  elsif v_phone_match_count > 1 then
    raise exception
      'That phone number matches multiple existing students.';
  end if;

  if v_student_id is not null then
    select
      s.uniqname::text,
      s.phone::text
    into
      v_existing_uniqname,
      v_existing_phone
    from public.students s
    where s.id = v_student_id;

    if v_uniqname is not null
       and nullif(
         lower(
           btrim(
             coalesce(
               v_existing_uniqname,
               ''
             )
           )
         ),
         ''
       ) is not null
       and lower(
         btrim(v_existing_uniqname)
       ) <> v_uniqname then
      raise exception
        'That phone number belongs to a student with a different uniqname.';
    end if;

    -- Enrich missing identity information, but never overwrite established identity.
    update public.students s
    set
      uniqname =
        case
          when nullif(
            btrim(coalesce(s.uniqname, '')),
            ''
          ) is null
          then coalesce(v_uniqname, s.uniqname)
          else s.uniqname
        end,
      phone =
        case
          when nullif(
            btrim(coalesce(s.phone, '')),
            ''
          ) is null
          then coalesce(v_phone, s.phone)
          else s.phone
        end,
      display_name =
        case
          when btrim(
            coalesce(s.display_name, '')
          ) = ''
          then v_name
          else s.display_name
        end,
      updated_at = now()
    where s.id = v_student_id;

  else
    insert into public.students (
      uniqname,
      display_name,
      phone
    )
    values (
      v_uniqname,
      v_name,
      v_phone
    )
    returning id
    into v_student_id;
  end if;

  -- If identity matching finds an existing contact in this campaign,
  -- do not create a duplicate. The UI can simply open that contact
  -- and log the new interaction there.
  select c.id
  into v_existing_contact_id
  from public.follow_up_contacts c
  where c.campaign_id = v_campaign_id
    and c.student_id = v_student_id
  limit 1;

  if v_existing_contact_id is not null then
    return jsonb_build_object(
      'contact_id',
      v_existing_contact_id,
      'student_id',
      v_student_id,
      'created',
      false,
      'matched_existing',
      true,
      'display_name',
      v_name
    );
  end if;

  insert into public.follow_up_contacts (
    campaign_id,
    student_id,
    phone,
    raw_location_text,
    ministry_location_id,
    location_resolution,
    house_name,
    room_or_address,
    status,
    contact_origin,
    field_added_by,
    field_added_from_contact_id,
    field_added_relationship
  )
  values (
    v_campaign_id,
    v_student_id,
    v_phone,
    v_raw_location_text,
    v_location_id,
    v_location_resolution,
    v_house_name,
    v_room_or_address,
    'uncontacted',
    'field_added',
    v_user_id,
    p_source_contact_id,
    nullif(
      btrim(
        coalesce(
          p_relationship,
          ''
        )
      ),
      ''
    )
  )
  returning id
  into v_contact_id;

  return jsonb_build_object(
    'contact_id',
    v_contact_id,
    'student_id',
    v_student_id,
    'created',
    true,
    'matched_existing',
    false,
    'display_name',
    v_name
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_field_added_contact_v2(p_display_name text, p_phone text DEFAULT NULL::text, p_uniqname text DEFAULT NULL::text, p_source_contact_id uuid DEFAULT NULL::uuid, p_ministry_location_id uuid DEFAULT NULL::uuid, p_room_or_address text DEFAULT NULL::text, p_relationship text DEFAULT NULL::text, p_gender text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_result jsonb;
  v_contact_id uuid;
  v_student_id uuid;

  v_gender text :=
    nullif(
      btrim(coalesce(p_gender, '')),
      ''
    );

  v_identity_input text :=
    lower(
      btrim(
        coalesce(p_uniqname, '')
      )
    );

  v_uniqname text;
  v_email text;
  v_phone text;
begin
  -- ----------------------------------------------------------
  -- Normalize U-M identity.
  -- Accept either a plain uniqname or the full @umich.edu email.
  -- ----------------------------------------------------------

  if v_identity_input <> '' then
    while
      v_identity_input like
      '%@umich.edu@umich.edu'
    loop
      v_identity_input :=
        regexp_replace(
          v_identity_input,
          '@umich\.edu@umich\.edu$',
          '@umich.edu'
        );
    end loop;

    if position('@' in v_identity_input) = 0 then
      v_uniqname := v_identity_input;

    elsif
      v_identity_input ~
      '^[a-z0-9._-]+@umich\.edu$'
    then
      v_uniqname :=
        split_part(
          v_identity_input,
          '@',
          1
        );

    else
      raise exception
        'Enter a U-M uniqname or an @umich.edu email address.';
    end if;

    if
      v_uniqname is null
      or v_uniqname = ''
      or v_uniqname !~
        '^[a-z0-9._-]+$'
    then
      raise exception
        'Enter a valid U-M uniqname or @umich.edu email address.';
    end if;

    v_email :=
      v_uniqname || '@umich.edu';
  end if;

  -- Reuse the field-tested creator for auth, campaign, location,
  -- phone normalization, exact identity matching, and provenance.
  v_result :=
    public.create_field_added_contact(
      p_display_name => p_display_name,
      p_phone => p_phone,
      p_uniqname => v_uniqname,
      p_source_contact_id => p_source_contact_id,
      p_ministry_location_id => p_ministry_location_id,
      p_room_or_address => p_room_or_address,
      p_relationship => p_relationship
    );

  v_contact_id :=
    nullif(
      coalesce(
        v_result ->> 'contact_id',
        ''
      ),
      ''
    )::uuid;

  v_student_id :=
    nullif(
      coalesce(
        v_result ->> 'student_id',
        ''
      ),
      ''
    )::uuid;

  -- A U-M email is deterministic from a uniqname. Fill it when the
  -- student record does not already have one; never overwrite a
  -- nonblank established email.
  if
    v_student_id is not null
    and v_email is not null
  then
    update public.students s
    set
      umich_email =
        case
          when nullif(
            btrim(
              coalesce(
                s.umich_email,
                ''
              )
            ),
            ''
          ) is null
          then v_email
          else lower(
            btrim(s.umich_email)
          )
        end,
      updated_at = now()
    where s.id = v_student_id;
  end if;

  -- Preserve the gender behavior from the deployed v2 RPC.
  if
    v_contact_id is not null
    and v_gender is not null
  then
    update public.follow_up_contacts c
    set gender_raw =
      case
        when nullif(
          btrim(
            coalesce(
              c.gender_raw,
              ''
            )
          ),
          ''
        ) is null
        then v_gender
        else c.gender_raw
      end
    where c.id = v_contact_id;
  end if;

  if v_contact_id is not null then
    select c.phone::text
    into v_phone
    from public.follow_up_contacts c
    where c.id = v_contact_id;
  end if;

  return
    v_result ||
    jsonb_build_object(
      'gender',
      v_gender,
      'phone',
      v_phone,
      'uniqname',
      v_uniqname,
      'umich_email',
      v_email
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.merge_follow_up_contacts(p_keep_contact_id uuid, p_merge_contact_id uuid, p_prefer_contact_id uuid DEFAULT NULL::uuid, p_match_basis text DEFAULT 'reviewed'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;

  v_keep public.follow_up_contacts%rowtype;
  v_merge public.follow_up_contacts%rowtype;

  v_keep_student public.students%rowtype;
  v_merge_student public.students%rowtype;

  v_preferred public.follow_up_contacts%rowtype;
  v_other public.follow_up_contacts%rowtype;

  v_preferred_student public.students%rowtype;
  v_other_student public.students%rowtype;

  v_keep_uniqname text;
  v_merge_uniqname text;
  v_keep_phone text;
  v_merge_phone text;

  v_name_match boolean := false;
  v_location_match boolean := false;
  v_room_match boolean := false;
  v_strong_match boolean := false;
  v_weak_match boolean := false;

  -- Only trusted server-side workflows should set one of the
  -- identity_edit_* match-basis values. Direct authenticated execution
  -- of this merge RPC is revoked below.
  v_identity_edit_override boolean := false;

  v_new_uniqname text;
  v_new_email text;
  v_new_student_phone text;
  v_new_display_name text;
  v_new_student_gender text;

  v_new_contact_phone text;

  v_source_other_contact_count integer;

  v_events_count integer;
  v_status_history_count integer;
  v_assignment_history_count integer;
  v_affinity_count integer;
  v_survey_link_count integer;
  v_child_source_count integer;

  v_log_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  select p.role::text
  into v_user_role
  from public.profiles p
  where p.id = v_user_id
    and p.is_active = true;

  if
    v_user_role is null
    or v_user_role not in (
      'student_leader',
      'discipler',
      'staff',
      'admin'
    )
  then
    raise exception 'Active Follow Up access is required.';
  end if;

  if
    p_keep_contact_id is null
    or p_merge_contact_id is null
    or p_keep_contact_id = p_merge_contact_id
  then
    raise exception 'Choose two different Follow Up contacts.';
  end if;

  -- Lock both contacts in deterministic UUID order.
  perform 1
  from public.follow_up_contacts c
  where c.id in (
    p_keep_contact_id,
    p_merge_contact_id
  )
  order by c.id::text
  for update;

  select c.*
  into v_keep
  from public.follow_up_contacts c
  join public.follow_up_campaigns campaign
    on campaign.id = c.campaign_id
  where c.id = p_keep_contact_id
    and campaign.status::text = 'active';

  if not found then
    raise exception 'The contact to keep is not in the active Follow Up campaign.';
  end if;

  select c.*
  into v_merge
  from public.follow_up_contacts c
  where c.id = p_merge_contact_id
    and c.campaign_id = v_keep.campaign_id;

  if not found then
    raise exception 'The duplicate contact is not in the same active Follow Up campaign.';
  end if;

  -- Lock both students in deterministic UUID order.
  perform 1
  from public.students s
  where s.id in (
    v_keep.student_id,
    v_merge.student_id
  )
  order by s.id::text
  for update;

  select s.*
  into v_keep_student
  from public.students s
  where s.id = v_keep.student_id;

  select s.*
  into v_merge_student
  from public.students s
  where s.id = v_merge.student_id;

  if
    v_keep_student.id is null
    or v_merge_student.id is null
  then
    raise exception 'Both contacts must have valid student records.';
  end if;

  if v_keep.student_id = v_merge.student_id then
    raise exception 'These contacts already point to the same student record.';
  end if;

  -- ----------------------------------------------------------
  -- Validate match safety again inside the write transaction.
  -- ----------------------------------------------------------

  v_keep_uniqname :=
    private.follow_up_normalize_uniqname(
      coalesce(
        nullif(
          btrim(v_keep_student.uniqname),
          ''
        ),
        v_keep_student.umich_email
      )
    );

  v_merge_uniqname :=
    private.follow_up_normalize_uniqname(
      coalesce(
        nullif(
          btrim(v_merge_student.uniqname),
          ''
        ),
        v_merge_student.umich_email
      )
    );

  v_keep_phone :=
    coalesce(
      private.follow_up_normalize_phone(
        v_keep_student.phone
      ),
      private.follow_up_normalize_phone(
        v_keep.phone
      )
    );

  v_merge_phone :=
    coalesce(
      private.follow_up_normalize_phone(
        v_merge_student.phone
      ),
      private.follow_up_normalize_phone(
        v_merge.phone
      )
    );

  v_name_match :=
    private.follow_up_normalize_match_text(
      v_keep_student.display_name
    ) is not null
    and
    private.follow_up_normalize_match_text(
      v_keep_student.display_name
    ) =
    private.follow_up_normalize_match_text(
      v_merge_student.display_name
    );

  v_location_match :=
    v_keep.ministry_location_id is not null
    and
    v_keep.ministry_location_id =
    v_merge.ministry_location_id;

  v_room_match :=
    private.follow_up_normalize_match_text(
      v_keep.room_or_address
    ) is not null
    and
    private.follow_up_normalize_match_text(
      v_keep.room_or_address
    ) =
    private.follow_up_normalize_match_text(
      v_merge.room_or_address
    );

  v_strong_match :=
    (
      v_keep_uniqname is not null
      and v_keep_uniqname = v_merge_uniqname
    )
    or
    (
      v_keep_phone is not null
      and v_keep_phone = v_merge_phone
    );

  v_weak_match :=
    v_name_match
    and v_location_match
    and v_room_match;

  v_identity_edit_override :=
    p_match_basis in (
      'identity_edit_umich',
      'identity_edit_phone_and_umich'
    );

  -- Two different established U-M identities are too dangerous to
  -- consolidate through this normal workflow.
  if
    v_keep_uniqname is not null
    and v_merge_uniqname is not null
    and v_keep_uniqname <> v_merge_uniqname
    and not v_identity_edit_override
  then
    raise exception
      'MERGE_BLOCKED_IDENTITY_CONFLICT: the contacts have different nonblank U-M identities.';
  end if;

  -- Student Leaders / Disciplers may merge only when the database itself
  -- can verify a strong match or the agreed exact weak match.
  if
    not v_strong_match
    and not v_weak_match
    and not v_identity_edit_override
    and v_user_role not in ('staff', 'admin')
  then
    raise exception
      'MERGE_BLOCKED_NO_MATCH: no strong identity match or exact name + location + room match was found.';
  end if;

  -- Keep cross-campaign student history out of this first merge engine.
  -- This avoids silently changing historical campaign identity.
  select count(*)
  into v_source_other_contact_count
  from public.follow_up_contacts c
  where c.student_id = v_merge.student_id
    and c.id <> v_merge.id;

  if v_source_other_contact_count > 0 then
    raise exception
      'MERGE_BLOCKED_OTHER_CAMPAIGN_HISTORY: the duplicate student has another campaign contact. Staff should review this case separately.';
  end if;

  -- ----------------------------------------------------------
  -- Choose profile/survey data precedence.
  -- ----------------------------------------------------------

  if p_prefer_contact_id is not null
     and p_prefer_contact_id not in (
       v_keep.id,
       v_merge.id
     )
  then
    raise exception 'Preferred data contact must be one of the two contacts being merged.';
  end if;

  if p_prefer_contact_id = v_merge.id then
    v_preferred := v_merge;
    v_other := v_keep;
    v_preferred_student := v_merge_student;
    v_other_student := v_keep_student;

  elsif p_prefer_contact_id = v_keep.id then
    v_preferred := v_keep;
    v_other := v_merge;
    v_preferred_student := v_keep_student;
    v_other_student := v_merge_student;

  elsif
    v_merge.contact_origin = 'survey'
    and v_keep.contact_origin <> 'survey'
  then
    v_preferred := v_merge;
    v_other := v_keep;
    v_preferred_student := v_merge_student;
    v_other_student := v_keep_student;

  else
    v_preferred := v_keep;
    v_other := v_merge;
    v_preferred_student := v_keep_student;
    v_other_student := v_merge_student;
  end if;

  v_new_uniqname :=
    coalesce(
      private.follow_up_normalize_uniqname(
        coalesce(
          nullif(
            btrim(v_preferred_student.uniqname),
            ''
          ),
          v_preferred_student.umich_email
        )
      ),
      private.follow_up_normalize_uniqname(
        coalesce(
          nullif(
            btrim(v_other_student.uniqname),
            ''
          ),
          v_other_student.umich_email
        )
      )
    );

  v_new_email :=
    case
      when v_new_uniqname is null
        then null
      else v_new_uniqname || '@umich.edu'
    end;

  v_new_student_phone :=
    coalesce(
      private.follow_up_normalize_phone(
        v_preferred_student.phone
      ),
      private.follow_up_normalize_phone(
        v_preferred.phone
      ),
      private.follow_up_normalize_phone(
        v_other_student.phone
      ),
      private.follow_up_normalize_phone(
        v_other.phone
      )
    );

  v_new_contact_phone := v_new_student_phone;

  v_new_display_name :=
    coalesce(
      nullif(
        btrim(
          coalesce(
            v_preferred_student.display_name,
            ''
          )
        ),
        ''
      ),
      nullif(
        btrim(
          coalesce(
            v_other_student.display_name,
            ''
          )
        ),
        ''
      ),
      'Unknown student'
    );

  v_new_student_gender :=
    coalesce(
      nullif(
        btrim(
          coalesce(
            v_preferred_student.gender_raw,
            ''
          )
        ),
        ''
      ),
      nullif(
        btrim(
          coalesce(
            v_other_student.gender_raw,
            ''
          )
        ),
        ''
      )
    );

  -- Make sure the chosen identity does not belong to a third student.
  if v_new_uniqname is not null then
    if exists (
      select 1
      from public.students s
      where s.id not in (
        v_keep.student_id,
        v_merge.student_id
      )
        and (
          lower(
            btrim(
              coalesce(
                s.uniqname,
                ''
              )
            )
          ) = v_new_uniqname
          or lower(
            btrim(
              coalesce(
                s.umich_email,
                ''
              )
            )
          ) = v_new_email
        )
    ) then
      raise exception
        'MERGE_BLOCKED_THIRD_IDENTITY: the chosen U-M identity belongs to another student.';
    end if;
  end if;

  -- ----------------------------------------------------------
  -- Capture counts and immutable before-snapshots.
  -- ----------------------------------------------------------

  select count(*)
  into v_events_count
  from public.follow_up_events e
  where e.contact_id = v_merge.id;

  select count(*)
  into v_status_history_count
  from public.follow_up_status_history h
  where h.contact_id = v_merge.id;

  select count(*)
  into v_assignment_history_count
  from public.follow_up_assignment_history h
  where h.contact_id = v_merge.id;

  select count(*)
  into v_affinity_count
  from public.follow_up_contact_affinities a
  where a.contact_id = v_merge.id;

  select count(*)
  into v_survey_link_count
  from public.survey_import_rows r
  where r.follow_up_contact_id = v_merge.id;

  select count(*)
  into v_child_source_count
  from public.follow_up_contacts c
  where c.field_added_from_contact_id = v_merge.id
    and c.id <> v_keep.id;

  -- ----------------------------------------------------------
  -- Move every contact-owned relationship BEFORE source delete.
  -- ----------------------------------------------------------

  update public.follow_up_events e
  set contact_id = v_keep.id
  where e.contact_id = v_merge.id;

  update public.follow_up_status_history h
  set contact_id = v_keep.id
  where h.contact_id = v_merge.id;

  update public.follow_up_assignment_history h
  set contact_id = v_keep.id
  where h.contact_id = v_merge.id;

  insert into public.follow_up_contact_affinities (
    contact_id,
    ministry_area_id,
    created_at
  )
  select
    v_keep.id,
    a.ministry_area_id,
    a.created_at
  from public.follow_up_contact_affinities a
  where a.contact_id = v_merge.id
  on conflict (
    contact_id,
    ministry_area_id
  )
  do nothing;

  delete from public.follow_up_contact_affinities a
  where a.contact_id = v_merge.id;

  update public.survey_import_rows r
  set follow_up_contact_id = v_keep.id
  where r.follow_up_contact_id = v_merge.id;

  -- Children introduced through the duplicate now point at the survivor.
  update public.follow_up_contacts c
  set field_added_from_contact_id = v_keep.id
  where c.field_added_from_contact_id = v_merge.id
    and c.id <> v_keep.id;

  -- Avoid a self-reference if the kept contact itself pointed at the duplicate.
  if v_keep.field_added_from_contact_id = v_merge.id then
    update public.follow_up_contacts c
    set field_added_from_contact_id =
      case
        when
          v_merge.field_added_from_contact_id is null
          or v_merge.field_added_from_contact_id = v_keep.id
        then null
        else v_merge.field_added_from_contact_id
      end
    where c.id = v_keep.id;

    select c.*
    into v_keep
    from public.follow_up_contacts c
    where c.id = p_keep_contact_id;
  end if;

  -- ----------------------------------------------------------
  -- Merge student identity/profile data.
  --
  -- Source uniqname/email are cleared first only inside this transaction
  -- so the unique indexes allow those values to move to the survivor.
  -- If anything later fails, PostgreSQL rolls the whole transaction back.
  -- ----------------------------------------------------------

  update public.students s
  set
    uniqname = null,
    umich_email = null,
    updated_at = now()
  where s.id = v_merge.student_id;

  update public.students s
  set
    display_name = v_new_display_name,
    uniqname = v_new_uniqname,
    umich_email = v_new_email,
    phone = v_new_student_phone,
    gender_raw = v_new_student_gender,
    updated_at = now()
  where s.id = v_keep.student_id;

  -- ----------------------------------------------------------
  -- Merge survey/profile fields into the surviving contact.
  -- Operational identity (contact id/history/provenance) remains KEEP.
  -- ----------------------------------------------------------

  update public.follow_up_contacts c
  set
    survey_submitted_at =
      coalesce(
        v_preferred.survey_submitted_at,
        v_other.survey_submitted_at
      ),

    year_at_um =
      coalesce(
        nullif(
          btrim(
            coalesce(
              v_preferred.year_at_um,
              ''
            )
          ),
          ''
        ),
        nullif(
          btrim(
            coalesce(
              v_other.year_at_um,
              ''
            )
          ),
          ''
        )
      ),

    gender_raw =
      coalesce(
        nullif(
          btrim(
            coalesce(
              v_preferred.gender_raw,
              ''
            )
          ),
          ''
        ),
        nullif(
          btrim(
            coalesce(
              v_other.gender_raw,
              ''
            )
          ),
          ''
        )
      ),

    phone = v_new_contact_phone,

    interview_interest =
      coalesce(
        v_preferred.interview_interest,
        v_other.interview_interest
      ),

    jesus_interest =
      coalesce(
        v_preferred.jesus_interest,
        v_other.jesus_interest
      ),

    community_interest =
      coalesce(
        v_preferred.community_interest,
        v_other.community_interest
      ),

    raw_location_text =
      coalesce(
        nullif(
          btrim(
            coalesce(
              v_preferred.raw_location_text,
              ''
            )
          ),
          ''
        ),
        nullif(
          btrim(
            coalesce(
              v_other.raw_location_text,
              ''
            )
          ),
          ''
        )
      ),

    ministry_location_id =
      coalesce(
        v_preferred.ministry_location_id,
        v_other.ministry_location_id
      ),

    location_resolution =
      case
        when
          coalesce(
            v_preferred.ministry_location_id,
            v_other.ministry_location_id
          ) is not null
        then 'resolved'
        else coalesce(
          v_preferred.location_resolution,
          v_other.location_resolution,
          'no_address'
        )
      end,

    room_or_address =
      coalesce(
        nullif(
          btrim(
            coalesce(
              v_preferred.room_or_address,
              ''
            )
          ),
          ''
        ),
        nullif(
          btrim(
            coalesce(
              v_other.room_or_address,
              ''
            )
          ),
          ''
        )
      ),

    house_name =
      coalesce(
        nullif(
          btrim(
            coalesce(
              v_preferred.house_name,
              ''
            )
          ),
          ''
        ),
        nullif(
          btrim(
            coalesce(
              v_other.house_name,
              ''
            )
          ),
          ''
        )
      ),

    status =
      case
        when
          v_keep.status = 'uncontacted'
          and v_merge.status <> 'uncontacted'
        then v_merge.status
        else v_keep.status
      end,

    primary_owner_id =
      coalesce(
        v_keep.primary_owner_id,
        v_merge.primary_owner_id
      ),

    coaching_correction_exempt_owner_id =
      coalesce(
        v_keep.coaching_correction_exempt_owner_id,
        v_merge.coaching_correction_exempt_owner_id
      ),

    coaching_correction_exempt_at =
      coalesce(
        v_keep.coaching_correction_exempt_at,
        v_merge.coaching_correction_exempt_at
      ),

    -- Keep origin/provenance from the surviving contact whenever available.
    contact_origin = v_keep.contact_origin,

    field_added_by =
      coalesce(
        v_keep.field_added_by,
        v_merge.field_added_by
      ),

    field_added_from_contact_id =
      case
        when
          v_keep.field_added_from_contact_id = v_merge.id
        then null
        else v_keep.field_added_from_contact_id
      end,

    field_added_relationship =
      coalesce(
        nullif(
          btrim(
            coalesce(
              v_keep.field_added_relationship,
              ''
            )
          ),
          ''
        ),
        nullif(
          btrim(
            coalesce(
              v_merge.field_added_relationship,
              ''
            )
          ),
          ''
        )
      ),

    updated_at = now()

  where c.id = v_keep.id;

  -- Recalculate event-derived summary fields after the event move.
  perform private.recalculate_follow_up_contact_progress(
    v_keep.id
  );

  -- The existing recalculation helper intentionally does not touch
  -- first/last interaction timestamps, so recompute those here.
  update public.follow_up_contacts c
  set
    first_interaction_at = (
      select min(e.occurred_at)
      from public.follow_up_events e
      where e.contact_id = v_keep.id
        and e.event_type::text = 'interaction'
    ),
    last_interaction_at = (
      select max(e.occurred_at)
      from public.follow_up_events e
      where e.contact_id = v_keep.id
        and e.event_type::text = 'interaction'
    ),
    updated_at = now()
  where c.id = v_keep.id;

  -- ----------------------------------------------------------
  -- Audit BEFORE deleting the duplicate.
  -- ----------------------------------------------------------

  insert into public.follow_up_contact_merge_log (
    campaign_id,
    kept_contact_id,
    merged_contact_id,
    kept_student_id,
    merged_student_id,
    preferred_data_contact_id,
    match_basis,
    merged_by,
    kept_contact_before,
    merged_contact_before,
    kept_student_before,
    merged_student_before,
    moved_counts
  )
  values (
    v_keep.campaign_id,
    v_keep.id,
    v_merge.id,
    v_keep.student_id,
    v_merge.student_id,
    coalesce(
      p_prefer_contact_id,
      v_preferred.id
    ),
    nullif(
      btrim(
        coalesce(
          p_match_basis,
          ''
        )
      ),
      ''
    ),
    v_user_id,
    to_jsonb(v_keep),
    to_jsonb(v_merge),
    to_jsonb(v_keep_student),
    to_jsonb(v_merge_student),
    jsonb_build_object(
      'events', v_events_count,
      'status_history', v_status_history_count,
      'assignment_history', v_assignment_history_count,
      'affinities', v_affinity_count,
      'survey_import_links', v_survey_link_count,
      'field_added_children_repointed', v_child_source_count
    )
  )
  returning id
  into v_log_id;

  -- All contact-owned rows have already been moved.
  delete from public.follow_up_contacts c
  where c.id = v_merge.id;

  -- The source student was verified to have no other campaign contacts.
  delete from public.students s
  where s.id = v_merge.student_id
    and not exists (
      select 1
      from public.follow_up_contacts c
      where c.student_id = s.id
    );

  return jsonb_build_object(
    'merged', true,
    'merge_log_id', v_log_id,
    'kept_contact_id', v_keep.id,
    'kept_student_id', v_keep.student_id,
    'merged_contact_id', v_merge.id,
    'merged_student_id', v_merge.student_id,
    'preferred_data_contact_id',
      coalesce(
        p_prefer_contact_id,
        v_preferred.id
      ),
    'match_basis',
      nullif(
        btrim(
          coalesce(
            p_match_basis,
            ''
          )
        ),
        ''
      ),
    'moved_counts',
      jsonb_build_object(
        'events', v_events_count,
        'status_history', v_status_history_count,
        'assignment_history', v_assignment_history_count,
        'affinities', v_affinity_count,
        'survey_import_links', v_survey_link_count,
        'field_added_children_repointed', v_child_source_count
      )
  );
end;
$function$;
