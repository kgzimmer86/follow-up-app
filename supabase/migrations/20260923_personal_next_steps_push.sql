-- Run AFTER 20260923_personal_next_steps.sql. Requires the existing push system.
-- Preserves the installed attention reader. No scheduler or subscriptions added.
-- Transactional; a rerun stops safely. Only due step IDs/times enter fingerprints.
begin;
do $$ declare definition text; begin
  if to_regprocedure('public.follow_up_next_step_due_count()') is null
    or to_regprocedure('private.follow_up_push_snapshot()') is null then
    raise exception 'Next Steps and personal push prerequisites are required.';
  end if;
  if to_regprocedure('private.follow_up_push_snapshot_before_next_steps()') is not null then
    raise exception 'Next Steps push adapter already exists. Verify instead of replaying.';
  end if;
  definition:=pg_get_functiondef('private.follow_up_push_snapshot()'::regprocedure);
  if position('SECURITY DEFINER' in definition)=0 or position('my_contact_attention_rows' in definition)=0 then
    raise exception 'Unexpected push snapshot baseline. Inspect before proceeding.';
  end if;
  definition:=replace(definition,'private.follow_up_push_snapshot()', 'private.follow_up_push_snapshot_before_next_steps()');
  execute definition;
end $$;

create or replace function private.follow_up_push_snapshot()
returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; steps jsonb; next_name text; stale_name text; stale_id uuid;
begin
  snapshot:=private.follow_up_push_snapshot_before_next_steps();
  select coalesce(jsonb_agg(jsonb_build_array(n.id,n.due_at) order by n.id),'[]'::jsonb) into steps
    from public.follow_up_next_steps n
    join public.follow_up_contacts c on c.id=n.contact_id
    join public.follow_up_campaigns f on f.id=c.campaign_id and f.status::text='active'
    where n.owner_id=auth.uid() and n.status='pending' and n.due_at<=now();
  select s.display_name into next_name from public.follow_up_next_steps n
    join public.follow_up_contacts c on c.id=n.contact_id
    join public.follow_up_campaigns f on f.id=c.campaign_id and f.status::text='active'
    join public.students s on s.id=c.student_id
    where n.owner_id=auth.uid() and n.status='pending' and n.due_at<=now()
    order by n.due_at,n.id limit 1;
  select a.contact_id,s.display_name into stale_id,stale_name
    from private.my_contact_attention_rows() a
    join public.follow_up_contacts c on c.id=a.contact_id
    join public.students s on s.id=c.student_id
    where a.stale_go_back and not exists(select 1 from public.follow_up_next_steps n
      where n.owner_id=auth.uid() and n.contact_id=a.contact_id and n.status='pending')
    order by a.contact_id limit 1;
  return snapshot || jsonb_build_object('nextSteps',jsonb_array_length(steps),
    'nextStepContactName',left(next_name,100),'staleContactName',left(stale_name,100),'staleContactId',stale_id,
    'total',(snapshot->>'total')::integer+jsonb_array_length(steps),
    'fingerprint',md5(jsonb_build_array(snapshot->>'fingerprint',steps,stale_id)::text));
end $$;
revoke all on function private.follow_up_push_snapshot(),private.follow_up_push_snapshot_before_next_steps() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
