-- Run this COMPLETE file in Supabase SQL Editor before deploying.
-- Community answer: all approved users. Other survey fields/affinities: Staff/Admin only.
-- No changes to existing rows until a user explicitly saves an edit.
begin;
create or replace function public.set_contact_survey_field(p_contact_id uuid, p_field text, p_value text)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_role text; v_value text := nullif(btrim(p_value), '');
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  select p.role::text into v_role from public.profiles p where p.id = auth.uid() and p.is_active = true;
  if v_role is null or v_role = 'pending' then raise exception 'Active Follow Up access required'; end if;
  if p_field is null or p_field not in ('community_interest','jesus_interest','interview_interest','gender_raw','year_at_um','house_name') then
    raise exception 'Invalid survey field'; end if;
  if p_field <> 'community_interest' and v_role not in ('staff','admin') then raise exception 'Staff or Admin access required'; end if;
  if p_field in ('community_interest','jesus_interest','interview_interest') then
    if v_value is not null and v_value not in ('yes','maybe','no')
       and not (p_field = 'jesus_interest' and v_value = 'already_have_one') then raise exception 'Invalid survey answer'; end if;
  elsif char_length(v_value) > 200 then raise exception 'Keep this field to 200 characters or fewer'; end if;
  update public.follow_up_contacts c set
    community_interest = case when p_field = 'community_interest' then v_value else c.community_interest end,
    jesus_interest = case when p_field = 'jesus_interest' then v_value else c.jesus_interest end,
    interview_interest = case when p_field = 'interview_interest' then v_value else c.interview_interest end,
    gender_raw = case when p_field = 'gender_raw' then v_value else c.gender_raw end,
    year_at_um = case when p_field = 'year_at_um' then v_value else c.year_at_um end,
    house_name = case when p_field = 'house_name' then v_value else c.house_name end
  where c.id = p_contact_id and exists (select 1 from public.follow_up_campaigns campaign where campaign.id = c.campaign_id and campaign.status = 'active');
  if not found then raise exception 'Contact is not part of the active Follow Up campaign'; end if;
end;
$function$;
revoke all on function public.set_contact_survey_field(uuid,text,text) from public;
grant execute on function public.set_contact_survey_field(uuid,text,text) to authenticated;

create or replace function public.set_contact_survey_affinities(p_contact_id uuid, p_area_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $function$
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true and p.role in ('staff','admin')) then
    raise exception 'Staff or Admin access required'; end if;
  if p_area_ids is null then raise exception 'Choose affinity interests or clear the selection'; end if;
  if exists (select 1 from unnest(p_area_ids) requested(id) where not exists (
    select 1 from public.ministry_areas a where a.id = requested.id and a.is_active = true and a.area_type = 'affinity'
  )) then raise exception 'Choose active affinity groups'; end if;
  perform c.id from public.follow_up_contacts c where c.id = p_contact_id and exists (
    select 1 from public.follow_up_campaigns campaign where campaign.id = c.campaign_id and campaign.status = 'active'
  ) for update of c;
  if not found then raise exception 'Contact is not part of the active Follow Up campaign'; end if;
  -- Retain historical/inactive associations that are not in the editable choices.
  delete from public.follow_up_contact_affinities ca where ca.contact_id = p_contact_id
    and not (ca.ministry_area_id = any(p_area_ids)) and exists (
      select 1 from public.ministry_areas a where a.id = ca.ministry_area_id and a.is_active = true and a.area_type = 'affinity'
    );
  insert into public.follow_up_contact_affinities(contact_id,ministry_area_id,created_at)
    select p_contact_id, requested.id, now() from (select distinct unnest(p_area_ids) as id) requested
    on conflict (contact_id,ministry_area_id) do nothing;
end;
$function$;
revoke all on function public.set_contact_survey_affinities(uuid,uuid[]) from public;
grant execute on function public.set_contact_survey_affinities(uuid,uuid[]) to authenticated;
notify pgrst, 'reload schema';
commit;
