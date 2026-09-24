-- Apply the complete file before deploying Assign Invitations multi-select UI.
-- Patches read filters only. No contact, ownership, invitation or roster writes.
begin;
do $migration$
declare
  reader text; source_oid oid; definition text;
  old_expression text; new_expression text; pair integer;
begin
  foreach reader in array array['get_invitation_contact_results','get_invitation_assignment_results'] loop
    select p.oid into strict source_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=reader
        and 'p_spreadsheet_status'=any(p.proargnames);
    definition := pg_get_functiondef(source_oid);
    for pair in 1..2 loop
      old_expression := case pair when 1 then 'b.status = v_status' else 'ca.ministry_area_id::text = v_affinity' end;
      new_expression := case pair when 1 then 'b.status = any(string_to_array(v_status, '',''))'
        else 'ca.ministry_area_id::text = any(string_to_array(v_affinity, '',''))' end;
      if position(new_expression in definition)>0 then continue; end if;
      if (length(definition)-length(replace(definition,old_expression,'')))/length(old_expression)<>1 then
        raise exception 'Reader % differs from expected filter shape. Nothing changed.',reader;
      end if;
      definition := replace(definition,old_expression,new_expression);
    end loop;
    execute definition;
  end loop;
end;
$migration$;
notify pgrst,'reload schema';
commit;

-- Expected: two rows, both flags true on each.
select p.proname as reader,
  position('b.status = any(string_to_array(v_status' in pg_get_functiondef(p.oid))>0 as multiple_statuses,
  position('ca.ministry_area_id::text = any(string_to_array(v_affinity' in pg_get_functiondef(p.oid))>0 as multiple_affinities
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('get_invitation_contact_results','get_invitation_assignment_results')
  and 'p_spreadsheet_status'=any(p.proargnames);
