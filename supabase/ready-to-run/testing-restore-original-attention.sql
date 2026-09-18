-- TESTING ONLY: Follow Up – Testing (tcbwepqkvnquxkbtaxcl).
-- Restore the exact notification reader saved before Next Steps.
-- Transactional and safe to repeat. No contacts, interactions, or plans deleted.
-- Run this complete file, then deploy the app rollback on codex/test-website.
begin;
do $$ declare definition text; begin
  if to_regprocedure('private.follow_up_push_snapshot_before_next_steps()') is null then
    raise exception 'Saved original notification reader missing. Stop; no changes applied.';
  end if;
  definition := pg_get_functiondef('private.follow_up_push_snapshot_before_next_steps()'::regprocedure);
  if position('SECURITY DEFINER' in definition)=0 or position('my_contact_attention_rows' in definition)=0 then
    raise exception 'Unexpected saved notification reader. Stop; no changes applied.';
  end if;
  execute replace(definition, 'private.follow_up_push_snapshot_before_next_steps()', 'private.follow_up_push_snapshot()');
end $$;
revoke all on function private.follow_up_push_snapshot() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;

-- Expected: all true. No contact data returned.
select
  pg_get_functiondef('private.follow_up_push_snapshot()'::regprocedure) =
    replace(pg_get_functiondef('private.follow_up_push_snapshot_before_next_steps()'::regprocedure),
      'private.follow_up_push_snapshot_before_next_steps()', 'private.follow_up_push_snapshot()') as original_reader_restored,
  not has_function_privilege('anon','private.follow_up_push_snapshot()','EXECUTE') as anonymous_denied,
  not has_function_privilege('authenticated','private.follow_up_push_snapshot()','EXECUTE') as client_execution_denied;
