-- Tested in preview; approved by Kyle and Glen for production on 2026-09-23.
-- Run before deploying the filter UI. Only this header differs from tested SQL.
-- Read-query changes only. Does not change card criteria, permissions or data.
-- Run the complete transaction. Unexpected definitions fail closed; safe to rerun.
begin;
do $migration$
declare
  reader record;
  definition text;
  old_expression text;
  new_expression text;
  pair integer;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_follow_up_contact_results_v2' and p.pronargs=34)
    or not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_follow_up_contact_results_search') then
    raise exception 'Install the current contact reader and name-search reader first';
  end if;
  for reader in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('get_follow_up_contact_results_v2','get_follow_up_contact_results_search','get_community_contact_results')
      and 'p_spreadsheet_status'=any(p.proargnames)
  loop
    definition := pg_get_functiondef(reader.oid);
    for pair in 1..2 loop
      old_expression := case pair when 1 then 'b.status = v_status' else 'ca.ministry_area_id::text = v_affinity' end;
      new_expression := case pair when 1 then 'b.status = any(string_to_array(v_status, '',''))'
        else 'ca.ministry_area_id::text = any(string_to_array(v_affinity, '',''))' end;
      if position(new_expression in definition)>0 then continue; end if;
      if (length(definition)-length(replace(definition,old_expression,'')))/length(old_expression)<>1 then
        raise exception 'Reader % differs from the expected filter shape. Nothing changed.', reader.proname;
      end if;
      definition := replace(definition,old_expression,new_expression);
    end loop;
    execute definition;
  end loop;
end;
$migration$;
notify pgrst,'reload schema';
commit;

select p.proname as reader,
  position('b.status = any(string_to_array(v_status' in pg_get_functiondef(p.oid))>0 as multiple_statuses,
  position('ca.ministry_area_id::text = any(string_to_array(v_affinity' in pg_get_functiondef(p.oid))>0 as multiple_affinities
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('get_follow_up_contact_results_v2','get_follow_up_contact_results_search','get_community_contact_results')
  and 'p_spreadsheet_status'=any(p.proargnames);
