-- Run this COMPLETE file. Adds two RPCs; does not change contact data or
-- replace existing assignment/search functions. Safe to rerun.
begin;

-- Clone the installed reader, preserving its current authorization, filters,
-- sorting and pagination. Search is applied before counting/pagination.
do $migration$
declare
  source_oid oid;
  source_sql text;
  search_sql text;
  signature text;
  marker text := 'where c.campaign_id = v_campaign_id';
begin
  select p.oid into strict source_oid from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_follow_up_contact_results_v2'
      and p.pronargs = 34 and 'p_spreadsheet_status' = any(p.proargnames);
  source_sql := pg_get_functiondef(source_oid);
  if position('SECURITY DEFINER' in source_sql) = 0
    or position('join public.students s on s.id = c.student_id' in source_sql) = 0
    or (length(source_sql)-length(replace(source_sql,marker,'')))/length(marker) <> 1 then
    raise exception 'Contact reader differs from the reviewed shape. No changes applied.';
  end if;
  search_sql := replace(source_sql,
    'public.get_follow_up_contact_results_v2(p_view text',
    'public.get_follow_up_contact_results_search(p_search text, p_view text');
  if search_sql = source_sql then raise exception 'Unable to construct name search reader.'; end if;
  search_sql := replace(search_sql, marker, marker || $search$
      and (nullif(btrim(p_search), '') is null
        or strpos(lower(coalesce(s.display_name, '')), lower(left(btrim(p_search), 200))) > 0)
$search$);
  execute search_sql;
  select p.oid::regprocedure::text into strict signature from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_follow_up_contact_results_search';
  execute 'revoke all on function ' || signature || ' from public, anon';
  execute 'grant execute on function ' || signature || ' to authenticated';
end;
$migration$;

create or replace function public.unassign_my_follow_up_contact(p_contact_id uuid)
returns void language plpgsql security definer set search_path = ''
as $function$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1 from public.profiles p
    where p.id = actor and p.is_active = true and p.role::text <> 'pending'
  ) then
    raise exception 'Active Follow Up access is required.';
  end if;
  -- Ownership is checked in the UPDATE itself, so a stale page cannot release
  -- a contact that someone else has since been assigned. No area restriction:
  -- an owner may release their own cross-area handoff as well.
  update public.follow_up_contacts c
  set primary_owner_id = null
  where c.id = p_contact_id and c.primary_owner_id = actor
    and exists (select 1 from public.follow_up_campaigns campaign
      where campaign.id = c.campaign_id and campaign.status::text = 'active');
  if not found then
    raise exception 'This contact is no longer assigned to you in an active campaign. Refresh the page and try again.';
  end if;
  -- Existing owner-change triggers clear assignment timestamps/author. Do not
  -- delete interaction history or change status, invitations or group records.
end;
$function$;
revoke all on function public.unassign_my_follow_up_contact(uuid) from public, anon;
grant execute on function public.unassign_my_follow_up_contact(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
