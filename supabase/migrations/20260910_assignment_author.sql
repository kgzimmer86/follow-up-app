-- Run this COMPLETE file in Supabase SQL Editor, after the staff handoffs migration.
-- Record the signed-in person who makes future assignments. Older assignments remain unknown.
-- No existing ownership, dates, statuses, history, or permissions are changed.
begin;

-- Keep the actor ID even if their profile is later removed. The display query
-- uses a left join and safely falls back to the date when no name is available.
alter table public.follow_up_contacts add column if not exists primary_assigned_by uuid;

create or replace function private.track_follow_up_assignment_time()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if TG_OP = 'INSERT' then
    new.primary_assigned_at := case when new.primary_owner_id is not null then now() else null end;
    new.primary_assigned_by := case when new.primary_owner_id is not null then auth.uid() else null end;
  elsif new.primary_owner_id is distinct from old.primary_owner_id then
    new.primary_assigned_at := case when new.primary_owner_id is not null then now() else null end;
    new.primary_assigned_by := case when new.primary_owner_id is not null then auth.uid() else null end;
  else
    new.primary_assigned_at := old.primary_assigned_at;
    new.primary_assigned_by := old.primary_assigned_by;
  end if;
  return new;
end;
$function$;
revoke all on function private.track_follow_up_assignment_time() from public;

create or replace function public.get_my_contact_attention_list(p_category text, p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_result jsonb;
begin
  if p_category is null or p_category not in ('awaiting','stale','new-believers') then raise exception 'Invalid attention category'; end if;
  with matches as materialized (
    select a.contact_id from private.my_contact_attention_rows() a
    where case p_category when 'awaiting' then a.unattempted when 'stale' then a.stale_go_back else a.new_believer end
  ), rows as (
    select c.id, coalesce(nullif(btrim(s.display_name),''),s.uniqname,'Unnamed contact') as display_name,
      ma.name as location_name, c.house_name, c.room_or_address, c.status,
      c.primary_assigned_at,
      nullif(btrim(assigner.display_name), '') as primary_assigned_by_name
    from matches m join public.follow_up_contacts c on c.id = m.contact_id
    left join public.profiles assigner on assigner.id = c.primary_assigned_by
    left join public.students s on s.id = c.student_id
    left join public.ministry_areas ma on ma.id = c.ministry_location_id
    order by display_name, c.id limit 50 offset greatest(coalesce(p_offset,0),0)
  ) select jsonb_build_object('total',(select count(*) from matches),
    'contacts',coalesce((select jsonb_agg(rows order by display_name,id) from rows),'[]'::jsonb)) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.get_my_contact_attention_list(text,integer) from public;
grant execute on function public.get_my_contact_attention_list(text,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
