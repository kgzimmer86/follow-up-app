-- Function supplied by the user from TEST Supabase on September 14, 2026.
-- Formatting normalized; behavior preserved, including RETURNS void.
CREATE OR REPLACE FUNCTION public.log_interaction(p_contact_id uuid, p_notes text DEFAULT NULL::text,
  p_had_spiritual_conversation boolean DEFAULT false, p_interview_completed boolean DEFAULT false,
  p_kgp_shared boolean DEFAULT false, p_received_christ boolean DEFAULT false,
  p_invited_to_community_group boolean DEFAULT false, p_status_after text DEFAULT NULL::text,
  p_make_primary boolean DEFAULT false, p_found_home boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare
  v_current_status text;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid() and is_active=true and role<>'pending') then
    raise exception 'Active Follow Up access required';
  end if;
  select contact.status into v_current_status from public.follow_up_contacts contact
    join public.follow_up_campaigns campaign on campaign.id=contact.campaign_id
    where contact.id=p_contact_id and campaign.status='active';
  if v_current_status is null then raise exception 'Contact is not part of the active Follow Up campaign'; end if;
  if p_status_after is not null and p_status_after not in ('uncontacted','attempted_contact','go_back','involved','not_interested') then
    raise exception 'Invalid Follow Up status';
  end if;
  if v_current_status='uncontacted' and (p_status_after is null or p_status_after='uncontacted') then
    raise exception 'Choose a new status before saving the first interaction';
  end if;
  insert into public.follow_up_events(contact_id,performed_by,event_type,occurred_at,notes,contact_method,
    had_spiritual_conversation,interview_completed,kgp_shared,received_christ,invited_to_community_group,status_after,found_home)
  values(p_contact_id,auth.uid(),'interaction',now(),nullif(trim(p_notes),''),'in_person',
    p_had_spiritual_conversation,p_interview_completed,p_kgp_shared or p_received_christ,
    p_received_christ,p_invited_to_community_group,p_status_after,p_found_home);
  if p_make_primary then update public.follow_up_contacts set primary_owner_id=auth.uid() where id=p_contact_id; end if;
end;
$function$;
