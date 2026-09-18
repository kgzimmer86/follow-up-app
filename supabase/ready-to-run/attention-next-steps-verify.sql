-- READ ONLY. After 20260924_attention_next_steps.sql in testing.
-- Expected: all checks true. No contact or guidance data returned.
select
  to_regprocedure('private.follow_up_push_snapshot_before_attention_steps()') is not null as previous_reader_preserved,
  (select relrowsecurity from pg_class where oid=to_regclass('private.follow_up_next_step_ai_requests')) as budget_rls,
  not has_table_privilege('authenticated','private.follow_up_next_step_ai_requests','SELECT,INSERT,UPDATE,DELETE') as budget_private,
  has_function_privilege('authenticated','public.follow_up_next_step_ai_claim(uuid)','EXECUTE') as approved_rpc_grant,
  not has_function_privilege('anon','public.follow_up_next_step_ai_claim(uuid)','EXECUTE') as anonymous_denied,
  not has_function_privilege('authenticated','private.follow_up_push_snapshot()','EXECUTE') as snapshot_private,
  not has_function_privilege('authenticated','private.follow_up_push_snapshot_before_attention_steps()','EXECUTE') as saved_snapshot_private;
