-- Test first. A separate endpoint preserves the installed Follow Up filters.
-- Refresh this endpoint and parity checks when the original contact query changes.
begin;
do $migration$
declare
  source_oid oid; source_sql text; scoped_sql text; signature text;
  guard_marker text := E'  with base as (\n';
  scope_marker text := 'where c.campaign_id = v_campaign_id';
begin
  if to_regprocedure('public.community_assign_invitations(uuid,uuid[],uuid,jsonb)') is null then
    raise exception 'Install invitation assignments first.';
  end if;
  select p.oid into strict source_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_follow_up_contact_results_v2'
      and 'p_spreadsheet_status'=any(p.proargnames);
  source_sql:=pg_get_functiondef(source_oid);
  if position('SECURITY DEFINER' in source_sql)=0 or position('p_view text' in source_sql)=0
    or position('join public.students s on s.id = c.student_id' in source_sql)=0
    or (length(source_sql)-length(replace(source_sql,guard_marker,'')))/length(guard_marker)<>1
    or (length(source_sql)-length(replace(source_sql,scope_marker,'')))/length(scope_marker)<>1 then
    raise exception 'Contact results query differs from the reviewed shape. No changes applied.';
  end if;
  scoped_sql:=replace(source_sql,'public.get_follow_up_contact_results_v2(p_view text',
    'public.get_invitation_contact_results(p_event_id uuid, p_group_id uuid, p_search text, p_view text');
  if scoped_sql=source_sql then raise exception 'Unable to construct invitation filter endpoint.'; end if;
  scoped_sql:=replace(scoped_sql,guard_marker,$guard$
  if v_view<>'area' or p_view is null then raise exception 'Invalid invitation contact view.'; end if;
  if not exists(select 1 from public.community_events e where e.id=p_event_id
    and e.campaign_id=v_campaign_id and public.can_access_community_event(e.id)) then
    raise exception 'This event is not in the active campaign.';
  end if;
  if p_group_id is not null and not exists(select 1 from public.community_groups g
    where g.id=p_group_id and g.campaign_id=v_campaign_id and g.is_active
      and public.can_access_community_group(g.id)) then
    raise exception 'This Community group roster is not available to you.';
  end if;
  with base as (
$guard$);
  scoped_sql:=replace(scoped_sql,scope_marker,scope_marker || $scope$
      and (nullif(btrim(p_search),'') is null
        or s.display_name ilike '%'||btrim(p_search)||'%'
        or s.uniqname ilike '%'||btrim(p_search)||'%')
      and (p_group_id is null or exists(select 1 from public.community_group_memberships m
        where m.group_id=p_group_id and m.student_id=c.student_id and m.ended_on is null))
$scope$);
  execute scoped_sql;
  select p.oid::regprocedure::text into strict signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_invitation_contact_results';
  execute 'revoke all on function '||signature||' from public, anon';
  execute 'grant execute on function '||signature||' to authenticated';
end;
$migration$;
notify pgrst,'reload schema';
commit;
