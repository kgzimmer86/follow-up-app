-- Run this complete file AFTER 20260910_my_stats.sql.
-- Read-only history of the signed-in user's work. Existing history/editing rules are unchanged.
begin;
create or replace function public.get_my_personal_activity(p_period text default 'week', p_offset integer default 0)
returns jsonb language sql security definer set search_path = '' as $function$
  with context as materialized (select * from private.my_personal_report_context(p_period)),
  recent as materialized (
    select e.id, e.contact_id, coalesce(nullif(btrim(s.display_name), ''), '?') as contact_name,
      e.event_type, e.occurred_at, e.notes, e.text_purposes, e.text_event_name,
      e.had_spiritual_conversation, e.interview_completed, e.kgp_shared,
      e.received_christ, e.invited_to_community_group,
      nullif(e.attachment_path, '') is not null as has_photo
    from public.follow_up_events e
    join public.follow_up_contacts c on c.id = e.contact_id
    left join public.students s on s.id = c.student_id
    cross join context x
    where e.performed_by = x.viewer_id and c.campaign_id = x.campaign_id
      and e.event_type::text in ('knock', 'text_attempt', 'interaction')
      and (x.since_at is null or e.occurred_at >= x.since_at) and e.occurred_at <= x.until_at
    order by e.occurred_at desc, e.id desc
    limit 26 offset greatest(coalesce(p_offset, 0), 0)
  ), visible as (select * from recent order by occurred_at desc, id desc limit 25)
  select jsonb_build_object(
    'has_campaign', (select campaign_id is not null from context),
    'has_more', (select count(*) > 25 from recent),
    'activity', coalesce((select jsonb_agg(visible order by occurred_at desc, id desc) from visible), '[]'::jsonb)
  );
$function$;
revoke all on function public.get_my_personal_activity(text,integer) from public;
grant execute on function public.get_my_personal_activity(text,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
