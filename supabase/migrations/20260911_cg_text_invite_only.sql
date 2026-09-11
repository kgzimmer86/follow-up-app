-- Run this complete file in Supabase SQL Editor before deploying.
-- A preference for CG invitation cards only. No statuses or existing history change.
begin;
alter table public.follow_up_contacts
  add column if not exists cg_text_invite_only boolean not null default false;

create or replace function public.set_contact_cg_text_invite_only(p_contact_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $function$
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true and p.role <> 'pending') then
    raise exception 'Active Follow Up access required'; end if;
  if p_enabled is null then raise exception 'Choose whether this contact wants text invitations only'; end if;
  update public.follow_up_contacts c set cg_text_invite_only = p_enabled
  where c.id = p_contact_id and exists (
    select 1 from public.follow_up_campaigns campaign where campaign.id = c.campaign_id and campaign.status = 'active'
  );
  if not found then raise exception 'Contact is not part of the active Follow Up campaign'; end if;
end;
$function$;
revoke all on function public.set_contact_cg_text_invite_only(uuid,boolean) from public;
grant execute on function public.set_contact_cg_text_invite_only(uuid,boolean) to authenticated;

-- Only the Invite to Community Group list uses this entry point.
-- The ordinary log_knock function is unchanged and still enforces its own rules.
create or replace function public.log_cg_invitation_knock(p_contact_id uuid)
returns void language plpgsql security definer set search_path = '' as $function$
declare v_text_only boolean;
begin
  if auth.uid() is null then raise exception 'You must be signed in'; end if;
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active = true and p.role <> 'pending') then
    raise exception 'Active Follow Up access required'; end if;
  select c.cg_text_invite_only into v_text_only from public.follow_up_contacts c
  where c.id = p_contact_id and exists (
    select 1 from public.follow_up_campaigns campaign where campaign.id = c.campaign_id and campaign.status = 'active'
  ) for update of c;
  if not found then raise exception 'Contact is not part of the active Follow Up campaign'; end if;
  if v_text_only then raise exception 'This contact requests text invitations only for Community Group'; end if;
  perform public.log_knock(p_contact_id);
end;
$function$;
revoke all on function public.log_cg_invitation_knock(uuid) from public;
grant execute on function public.log_cg_invitation_knock(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
