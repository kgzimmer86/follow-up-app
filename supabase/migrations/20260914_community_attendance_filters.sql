-- Extend only the installed Community query; ordinary Follow Up remains unchanged.
-- A rerun is a no-op after validating the expanded markers.
begin;
do $migration$
declare
  source_oid oid; source_sql text; revised_sql text;
  old_guard text := $$('involved','roster','attended','ever')$$;
  new_guard text := $$('involved','roster','attended','ever','ever_attending','ever_former')$$;
  old_attendance text := $$p_segment in ('attended','ever') and exists($$;
  new_attendance text := $$p_segment in ('attended','ever','ever_attending','ever_former')
          and (p_segment not in ('ever_attending','ever_former') or
            (exists(select 1 from public.community_group_memberships scope_member
              where scope_member.group_id=p_group_id and scope_member.student_id=c.student_id
                and scope_member.ended_on is null)) = (p_segment='ever_attending'))
          and exists($$;
  old_latest text := $$p_segment='ever' or mt.id=$$;
  new_latest text := $$p_segment in ('ever','ever_attending','ever_former') or mt.id=$$;
begin
  select p.oid into strict source_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_community_contact_results';
  source_sql:=pg_get_functiondef(source_oid);
  if position(new_guard in source_sql)>0 and position(new_attendance in source_sql)>0 and position(new_latest in source_sql)>0 then return; end if;
  if (length(source_sql)-length(replace(source_sql,old_guard,'')))/length(old_guard)<>1
    or (length(source_sql)-length(replace(source_sql,old_attendance,'')))/length(old_attendance)<>1
    or (length(source_sql)-length(replace(source_sql,old_latest,'')))/length(old_latest)<>1 then
    raise exception 'Community contact query differs from the reviewed shape. Stop and inspect; no changes applied.';
  end if;
  revised_sql:=replace(replace(replace(source_sql,old_guard,new_guard),old_attendance,new_attendance),old_latest,new_latest);
  execute revised_sql;
end;
$migration$;
notify pgrst,'reload schema';
commit;
