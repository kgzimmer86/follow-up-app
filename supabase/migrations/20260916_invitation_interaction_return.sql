-- Preserve the installed interaction behavior while returning the inserted ID
-- to the atomic invitation logger. The normal Follow Up function is unchanged.
begin;
do $migration$
declare source_oid oid; definition text; body text; updated_body text; wrapper text;
begin
  source_oid := to_regprocedure('public.log_interaction(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean)');
  if source_oid is null then raise exception 'Existing interaction function missing.'; end if;
  select p.prosrc into body from pg_proc p where p.oid=source_oid and p.prorettype='void'::regtype;
  if body is null then raise exception 'Expected the installed void-returning interaction function. Inspect before proceeding.'; end if;
  if (select count(*) from regexp_matches(body,'insert[[:space:]]+into[[:space:]]+public[.]follow_up_events','gi'))<>1
    or (select count(*) from regexp_matches(body,'p_found_home[[:space:]]*\)[[:space:]]*;','g'))<>1
    or body !~* 'end;[[:space:]]*$' then
    raise exception 'Interaction function shape differs. No changes applied.';
  end if;
  updated_body := regexp_replace(body,'\mdeclare\M','declare invitation_history_id uuid;','i');
  updated_body := regexp_replace(updated_body,'(p_found_home[[:space:]]*\))[[:space:]]*;','\1 returning id into invitation_history_id;');
  updated_body := regexp_replace(updated_body,'end;[[:space:]]*$',E'return invitation_history_id;\nend;','i');
  definition := pg_get_functiondef(source_oid);
  definition := replace(definition,'public.log_interaction(', 'private.community_log_interaction(');
  definition := replace(definition,'RETURNS void','RETURNS uuid');
  definition := replace(definition,body,updated_body);
  execute definition;
  revoke all on function private.community_log_interaction(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean) from public,anon,authenticated;
  wrapper := pg_get_functiondef('public.community_log_outreach(uuid,uuid,uuid,text,text,jsonb)'::regprocedure);
  if position('history_id:=public.log_interaction(' in wrapper)>0 then
    wrapper := replace(wrapper,'history_id:=public.log_interaction(', 'history_id:=private.community_log_interaction(');
    execute wrapper;
  elsif position('history_id:=private.community_log_interaction(' in wrapper)=0 then
    raise exception 'Invitation logger differs from the expected shape. No changes applied.';
  end if;
end;
$migration$;
commit;
