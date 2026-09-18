-- RECOVERY ONLY, Kyle approval required. Preserves all plans and interactions.
-- Restores the exact snapshot captured before the Next Steps push adapter.
-- Also redeploy with NEXT_PUBLIC_NEXT_STEPS_ENABLED=false to hide the feature.
-- Transactional and safe to rerun. Does not uninstall or replay other migrations.
begin;
do $$ declare definition text; begin
  if to_regprocedure('private.follow_up_push_snapshot_before_next_steps()') is null then
    raise exception 'Saved push snapshot missing. Stop and inspect; no changes applied.';
  end if;
  definition:=pg_get_functiondef('private.follow_up_push_snapshot_before_next_steps()'::regprocedure);
  definition:=replace(definition,'private.follow_up_push_snapshot_before_next_steps()', 'private.follow_up_push_snapshot()');
  execute definition;
end $$;
revoke all on function private.follow_up_push_snapshot() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
