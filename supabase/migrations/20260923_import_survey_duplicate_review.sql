-- Apply to Testing first with the matching UI change. Does NOT clean up records.
-- Preserve the installed importer, authorization, grants, and merge engine.
begin;
do $migration$
declare
  preview text := pg_get_functiondef('public.preview_survey_import_weak_matches(uuid,jsonb)'::regprocedure);
  importer text := pg_get_functiondef('public.import_survey_rows_v2(uuid,text,jsonb,jsonb)'::regprocedure);
  marker text := E'    -- Existing campaign contact: keep it by default.';
  guard text := $guard$
    -- Import review v2: validate current name/location/room candidates in the
    -- write transaction, including conflicting identifiers and survey contacts.
    if not v_student_was_created then
      perform private.require_import_match_review(v_campaign_id, v_item, v_student_id);
    end if;

$guard$;
begin
  if strpos(importer, 'private.require_import_match_review(v_campaign_id, v_item, v_student_id)') > 0
     and strpos(preview, 'and c.contact_origin = ''field_added''') = 0 then
    return;
  end if;
  if md5(preview) <> 'c4e68f66a4ada3f904c80031913611a0'
     or md5(importer) <> '4d5333632f4ff7aeb3103662625b57e8' then
    raise exception 'Import functions differ from the reviewed export. No changes applied.';
  end if;
  preview := replace(preview, E'      and c.contact_origin = ''field_added''\n', '');
  preview := replace(preview, 'if v_role not in (''staff'', ''admin'') then',
    'if v_role is null or v_role not in (''staff'', ''admin'') then');
  execute preview;
  importer := replace(importer, '  v_student_id uuid;', E'  v_student_id uuid;\n  v_student_was_created boolean;');
  importer := replace(importer, E'    v_student_id := null;', E'    v_student_id := null;\n    v_student_was_created := false;');
  importer := replace(importer, E'      into v_student_id;', E'      into v_student_id;\n      v_student_was_created := true;');
  -- Serialize imports in the same campaign (including the final recheck).
  importer := replace(importer, E'  limit 1;\n\n  if v_campaign_id is null',
    E'  limit 1 for update;\n\n  if v_campaign_id is null');
  -- Check BEFORE creating a new student: otherwise it could mask a conflict.
  importer := replace(importer, E'    else\n      insert into public.students (',
    E'    else\n      perform private.require_import_match_review(v_campaign_id, v_item, null);\n      insert into public.students (');
  importer := replace(importer, marker, guard || marker);
  importer := replace(importer, E'      if v_merge_target_contact.contact_origin <> ''field_added'' then',
    E'      if v_merge_target_contact.contact_origin not in (''field_added'', ''survey'') then');
  importer := replace(importer, E'    if v_action = ''merge_into_existing'' then\n',
    E'    if v_action = ''merge_into_existing'' then\n      perform private.require_import_match_review(v_campaign_id, v_item, null);\n');
  -- Survey matches retain the existing survey values; fill missing fields only.
  -- Field-added matches retain the original incoming-survey preference.
  importer := replace(importer, E'          p_prefer_contact_id =>\n            v_temp_contact_id,',
    E'          p_prefer_contact_id =>\n            case when v_merge_target_contact.contact_origin = ''survey''\n              then v_merge_target_contact.id else v_temp_contact_id end,');
  importer := replace(importer, 'field-added contact', 'existing contact');
  execute importer;
end;
$migration$;

create or replace function private.require_import_match_review(
  p_campaign uuid, p_row jsonb, p_student uuid
) returns void language plpgsql set search_path='' as $function$
declare
  candidates jsonb;
  reviewed jsonb := p_row->'reviewed_match_candidates';
  action text := coalesce(p_row->>'action','import');
  target text := p_row->>'merge_contact_id';
begin
  select coalesce(jsonb_agg(c.value order by c.value->>'contact_id'),'[]'::jsonb)
  into candidates
  from jsonb_array_elements(
    public.preview_survey_import_weak_matches(p_campaign,jsonb_build_array(p_row))->0->'candidates'
  ) c
  where p_student is null or c.value->>'student_id' <> p_student::text
    or (c.value->>'identity_conflict')::boolean
    or (c.value->>'phone_differs')::boolean;
  if jsonb_array_length(candidates)=0 then
    if action='merge_into_existing' then
      raise exception 'Possible match changed. Check existing students again.';
    end if;
    return;
  end if;
  if p_student is not null then
    raise exception 'Conflicting possible match. Verify U-M identity in MCommunity and phone, correct the row, and check again; or exclude it.';
  end if;
  select coalesce(jsonb_agg(c.value order by c.value->>'contact_id'),'[]'::jsonb)
    into reviewed from jsonb_array_elements(coalesce(reviewed,'[]'::jsonb)) c;
  if reviewed is distinct from candidates then
    raise exception 'Possible match changed or was not reviewed. Check existing students again.';
  end if;
  if action='merge_into_existing' then
    if jsonb_array_length(candidates)<>1
       or candidates->0->>'contact_id' is distinct from target
       or (candidates->0->>'identity_conflict')::boolean
       or (candidates->0->>'phone_differs')::boolean then
      raise exception 'Merge blocked: verify conflicting identity/phone or multiple candidates first.';
    end if;
  elsif p_row->>'match_review_choice' is distinct from 'keep_separate' then
    raise exception 'Confirm these are different people before importing a separate contact.';
  end if;
end;
$function$;
revoke all on function private.require_import_match_review(uuid,jsonb,uuid) from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
