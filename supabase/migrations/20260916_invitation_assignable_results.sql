-- Keep full spreadsheet results; filter assignment cards before pagination.
begin;
do $migration$
declare source_oid oid; definition text; args text; marker text := 'where c.campaign_id = v_campaign_id'; signature text;
begin
  select p.oid into strict source_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_invitation_contact_results';
  definition := pg_get_functiondef(source_oid);
  args := pg_get_function_arguments(source_oid);
  if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1
    or position('SECURITY DEFINER' in definition)=0 then
    raise exception 'Invitation query differs from the reviewed shape. No changes applied.';
  end if;
  definition := replace(definition, 'public.get_invitation_contact_results('||args||')',
    'public.get_invitation_assignment_results('||args||', p_assignable_only boolean DEFAULT false)');
  if position('public.get_invitation_assignment_results(' in definition)=0 then raise exception 'Unable to create assignment query.'; end if;
  definition := replace(definition,marker,marker||$filter$
      and (not coalesce(p_assignable_only,false) or (
        exists(select 1 from public.community_events eligible_event where eligible_event.id=p_event_id
          and eligible_event.is_open and eligible_event.event_date >= (now() at time zone 'America/Detroit')::date)
        and not exists(select 1 from public.community_event_invitations invitation
          where invitation.event_id=p_event_id and invitation.student_id=c.student_id
            and (invitation.first_invited_at is not null or invitation.status<>'not_asked'
              or (invitation.assigned_to is not null and not exists(select 1 from public.profiles viewer
                where viewer.id=auth.uid() and viewer.role in ('staff','admin')))))
      ))
$filter$);
  execute definition;
  select p.oid::regprocedure::text into strict signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_invitation_assignment_results';
  execute 'revoke all on function '||signature||' from public, anon';
  execute 'grant execute on function '||signature||' to authenticated';
end;
$migration$;
notify pgrst,'reload schema';
commit;
