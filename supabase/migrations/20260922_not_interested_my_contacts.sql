-- Run AFTER 20260921_contact_name_search_and_self_unassign.sql.
-- Read-rule changes only: no ownership, history, status, or other data is edited.
begin;
do $migration$
declare
  name text;
  reader oid;
  definition text;
  old_rule text := '(v_view = ''mine'' and b.primary_owner_id = v_user_id)';
  new_rule text := '(v_view = ''mine'' and b.primary_owner_id = v_user_id and b.status <> ''not_interested'')';
begin
  foreach name in array array['get_follow_up_contact_results_v2', 'get_follow_up_contact_results_search'] loop
    select p.oid into strict reader from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=name and 'p_spreadsheet_status'=any(p.proargnames);
    definition := pg_get_functiondef(reader);
    if position(new_rule in definition)>0 then continue; end if;
    if (length(definition)-length(replace(definition,old_rule,'')))/length(old_rule)<>1 then
      raise exception 'My Contacts reader % differs from the reviewed shape. No changes applied.',name;
    end if;
    execute replace(definition,old_rule,new_rule);
  end loop;

  reader := to_regprocedure('private.my_contact_attention_rows()');
  if reader is null then raise exception 'Install owner-specific attention rules first.'; end if;
  definition := pg_get_functiondef(reader);
  old_rule := 'where c.primary_owner_id = v_user_id and campaign.status::text = ''active''';
  new_rule := old_rule || ' and c.status <> ''not_interested''';
  if position(new_rule in definition)=0 then
    if (length(definition)-length(replace(definition,old_rule,'')))/length(old_rule)<>1 then
      raise exception 'My Contacts attention differs from the reviewed shape. No changes applied.';
    end if;
    execute replace(definition,old_rule,new_rule);
  end if;
end;
$migration$;
notify pgrst,'reload schema';
commit;
