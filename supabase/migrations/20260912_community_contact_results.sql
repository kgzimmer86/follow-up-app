-- Adds a separate group-scoped endpoint; never replaces the normal Follow Up RPC.
-- Clone the installed query so its current filters, permissions, and card fields
-- remain identical. Fail closed if the expected query structure has changed.
-- Future changes to the original results function require rerunning this migration
-- and its parity tests to refresh this separate endpoint.
begin;
do $migration$
declare
  source_oid oid;
  source_sql text;
  scoped_sql text;
  target_signature text;
  guard_marker text := E'  with base as (\n';
  scope_marker text := 'where c.campaign_id = v_campaign_id';
begin
  select p.oid into strict source_oid
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_follow_up_contact_results_v2'
    and 'p_spreadsheet_status'=any(p.proargnames);
  source_sql := pg_get_functiondef(source_oid);
  if position('SECURITY DEFINER' in source_sql)=0
     or position('p_view text' in source_sql)=0
     or (length(source_sql)-length(replace(source_sql,guard_marker,'')))/length(guard_marker)<>1
     or (length(source_sql)-length(replace(source_sql,scope_marker,'')))/length(scope_marker)<>1 then
    raise exception 'Contact results query differs from the reviewed shape. No changes applied.';
  end if;
  scoped_sql := replace(source_sql,
    'public.get_follow_up_contact_results_v2(p_view text',
    'public.get_community_contact_results(p_group_id uuid, p_segment text, p_view text');
  if scoped_sql=source_sql then raise exception 'Unable to construct scoped endpoint.'; end if;
  scoped_sql := replace(scoped_sql,guard_marker,$guard$
  if p_group_id is null or not public.can_access_community_group(p_group_id) then
    raise exception 'This Community Group is not available to you.';
  end if;
  if p_segment is null or p_segment not in ('involved','roster','attended','ever') or v_view <> 'area' then
    raise exception 'Invalid Community contact filter.';
  end if;
  if not exists(select 1 from public.community_groups g
    where g.id=p_group_id and g.campaign_id=v_campaign_id) then
    raise exception 'Only groups in the active campaign support contact shortcuts.';
  end if;
  with base as (
$guard$);
  scoped_sql := replace(scoped_sql,scope_marker,scope_marker || $scope$
      and (
        (p_segment in ('roster','involved')
          and (p_segment='roster' or c.status::text='involved')
          and exists(select 1 from public.community_group_memberships gm
            where gm.group_id=p_group_id and gm.student_id=c.student_id and gm.ended_on is null))
        or
        (p_segment in ('attended','ever') and exists(
          select 1 from public.community_group_attendance ga
          join public.community_group_meetings mt on mt.id=ga.meeting_id
          where mt.group_id=p_group_id and ga.student_id=c.student_id and ga.is_present
            and (p_segment='ever' or mt.id=(
              select latest.id from public.community_group_meetings latest
              where latest.group_id=p_group_id order by latest.meeting_date desc limit 1))))
      )
$scope$);
  execute scoped_sql;
  select p.oid::regprocedure::text into strict target_signature
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='get_community_contact_results';
  execute 'revoke all on function ' || target_signature || ' from public, anon';
  execute 'grant execute on function ' || target_signature || ' to authenticated';
end;
$migration$;
notify pgrst, 'reload schema';
commit;
