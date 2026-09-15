-- Read-only prerequisites. Run before the migration.
select
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_follow_up_contact_results_v2'
      and p.pronargs=34 and 'p_spreadsheet_status'=any(p.proargnames)) as contact_reader_exists,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_follow_up_contact_results_v2'
      and p.pronargs=34
      and position('join public.students s on s.id = c.student_id' in p.prosrc)>0
      and (length(p.prosrc)-length(replace(p.prosrc,'where c.campaign_id = v_campaign_id','')))
          /length('where c.campaign_id = v_campaign_id')=1) as search_shape_matches,
  exists(select 1 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
    where t.tgrelid='public.follow_up_contacts'::regclass and not t.tgisinternal
      and t.tgenabled <> 'D' and p.prosrc like '%primary_assigned_by%'
      and p.prosrc like '%primary_assigned_at%') as assignment_metadata_trigger_exists,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_follow_up_contact_results_search') as search_already_installed,
  to_regprocedure('public.unassign_my_follow_up_contact(uuid)') is not null as self_unassign_already_installed,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='my_contact_attention_rows'
      and position('where c.primary_owner_id = v_user_id and campaign.status::text = ''active''' in p.prosrc)>0) as attention_shape_matches,
  exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_follow_up_contact_results_v2'
      and position('(v_view = ''mine'' and b.primary_owner_id = v_user_id' in p.prosrc)>0) as my_contacts_shape_matches;
