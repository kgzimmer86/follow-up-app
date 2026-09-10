-- My Contacts attention counts. Run this complete file in Supabase SQL Editor.
-- Read-only function: no student records, statuses, or ownership are changed.
begin;

create or replace function public.get_my_contact_attention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'You must be signed in'; end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = v_user_id and p.is_active = true and p.role <> 'pending'
  ) then raise exception 'Active Follow Up access required'; end if;

  with attention as (
    select
      not activity.has_attempt as unattempted,
      c.status::text = 'go_back'
        and activity.last_activity_at <= now() - interval '7 days' as stale_go_back,
      c.received_christ_at <= now() - interval '24 hours'
        and not activity.has_later_interaction as new_believer
    from public.follow_up_contacts c
    join public.follow_up_campaigns campaign on campaign.id = c.campaign_id
    cross join lateral (
      select
        coalesce(bool_or(e.event_type::text in ('knock', 'text_attempt', 'interaction')), false) as has_attempt,
        max(e.occurred_at) as last_activity_at,
        coalesce(bool_or(e.event_type::text = 'interaction' and e.occurred_at > c.received_christ_at), false) as has_later_interaction
      from public.follow_up_events e
      where e.contact_id = c.id
    ) activity
    where c.primary_owner_id = v_user_id and campaign.status::text = 'active'
  )
  select jsonb_build_object(
    'unattempted', count(*) filter (where unattempted),
    'staleGoBacks', count(*) filter (where stale_go_back),
    'newBelievers', count(*) filter (where new_believer),
    'total', count(*) filter (where unattempted or stale_go_back or new_believer)
  ) into v_result from attention;
  return v_result;
end;
$function$;

revoke all on function public.get_my_contact_attention() from public;
grant execute on function public.get_my_contact_attention() to authenticated;
notify pgrst, 'reload schema';
commit;
