-- Run this complete file in Supabase SQL Editor. Read-only personal reports:
-- no changes to contacts, events, permissions on existing features, or table structure.
begin;

create or replace function private.my_personal_report_context(p_period text)
returns table(viewer_id uuid, campaign_id uuid, since_at timestamptz, until_at timestamptz)
language plpgsql security definer set search_path = '' as $function$
declare v_user_id uuid := auth.uid(); v_campaign_id uuid;
begin
  if v_user_id is null then raise exception 'You must be signed in'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.is_active = true and p.role <> 'pending') then
    raise exception 'Active Follow Up access required'; end if;
  if p_period is null or p_period not in ('week', 'month', 'campaign') then raise exception 'Invalid reporting period'; end if;
  select c.id into v_campaign_id from public.follow_up_campaigns c
  where c.status = 'active' order by c.created_at desc, c.id desc limit 1;
  return query select v_user_id, v_campaign_id,
    case p_period when 'week' then now() - interval '168 hours'
      when 'month' then now() - interval '720 hours' else null::timestamptz end, now();
end;
$function$;
revoke all on function private.my_personal_report_context(text) from public, authenticated;

create or replace function public.get_my_personal_stats(p_period text default 'week')
returns jsonb language sql security definer set search_path = '' as $function$
  with context as materialized (select * from private.my_personal_report_context(p_period)),
  activity as (
    select e.* from public.follow_up_events e
    join public.follow_up_contacts c on c.id = e.contact_id
    cross join context x
    where e.performed_by = x.viewer_id and c.campaign_id = x.campaign_id
      and (x.since_at is null or e.occurred_at >= x.since_at) and e.occurred_at <= x.until_at
  )
  select jsonb_build_object(
    'has_campaign', (select campaign_id is not null from context),
    'knocks', count(*) filter (where event_type::text = 'knock'),
    'text_attempts', count(*) filter (where event_type::text = 'text_attempt'),
    'interactions', count(*) filter (where event_type::text = 'interaction'),
    'spiritual_conversations', count(*) filter (where event_type::text = 'interaction'
      and (had_spiritual_conversation or interview_completed or kgp_shared or received_christ)),
    'interviews_completed', count(*) filter (where event_type::text = 'interaction' and interview_completed),
    'kgp_shared', count(*) filter (where event_type::text = 'interaction' and kgp_shared),
    'received_christ', count(*) filter (where event_type::text = 'interaction' and received_christ),
    'cg_invitations', count(*) filter (where event_type::text = 'interaction' and invited_to_community_group)
  ) from activity;
$function$;
revoke all on function public.get_my_personal_stats(text) from public;
grant execute on function public.get_my_personal_stats(text) to authenticated;
notify pgrst, 'reload schema';
commit;
