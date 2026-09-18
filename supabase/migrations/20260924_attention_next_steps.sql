-- After both 20260923 Next Steps migrations. Additive; no contact data changed.
-- Transactional. A repeated installation stops; verify instead of replaying.
begin;
do $$ begin
  if to_regprocedure('private.follow_up_push_snapshot_before_next_steps()') is null
    or to_regprocedure('private.follow_up_push_snapshot()') is null
    or to_regclass('public.follow_up_next_steps') is null then
    raise exception 'Install and verify the existing Next Steps migrations first.';
  end if;
  if to_regprocedure('private.follow_up_push_snapshot_before_attention_steps()') is not null then
    raise exception 'Attention next steps already installed; verify instead of replaying.';
  end if;
  execute replace(pg_get_functiondef('private.follow_up_push_snapshot()'::regprocedure),
    'private.follow_up_push_snapshot()', 'private.follow_up_push_snapshot_before_attention_steps()');
end $$;

create or replace function private.follow_up_push_snapshot()
returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; picked record; eligible jsonb;
begin
  snapshot := private.follow_up_push_snapshot_before_attention_steps();
  select a.contact_id, s.display_name,
    case when a.new_believer then 'new-believers' when a.stale_go_back then 'stale' else 'awaiting' end as category
    into picked
    from private.my_contact_attention_rows() a
    join public.follow_up_contacts c on c.id=a.contact_id
    join public.students s on s.id=c.student_id
    where (a.unattempted or a.stale_go_back or a.new_believer)
      and not exists(select 1 from public.follow_up_next_steps n
        where n.owner_id=auth.uid() and n.contact_id=a.contact_id and n.status='pending')
    order by a.new_believer desc,a.stale_go_back desc,a.contact_id limit 1;
  select coalesce(jsonb_agg(jsonb_build_array(a.contact_id,a.unattempted,a.stale_go_back,a.new_believer) order by a.contact_id),'[]'::jsonb)
    into eligible from private.my_contact_attention_rows() a
    where (a.unattempted or a.stale_go_back or a.new_believer)
      and not exists(select 1 from public.follow_up_next_steps n
        where n.owner_id=auth.uid() and n.contact_id=a.contact_id and n.status='pending');
  return snapshot || jsonb_build_object('attentionContactId',picked.contact_id,
    'attentionContactName',left(picked.display_name,100),'attentionCategory',picked.category,
    'suppressContactReminder',jsonb_array_length(eligible)=0
      and coalesce((snapshot->>'nextSteps')::integer,0)=0
      and (snapshot->>'invitations')::integer=0 and (snapshot->>'groups')::integer=0
      and (snapshot->>'contacts')::integer>0,
    'fingerprint',md5(jsonb_build_array(snapshot->>'fingerprint',eligible)::text));
end $$;
revoke all on function private.follow_up_push_snapshot(),private.follow_up_push_snapshot_before_attention_steps() from public,anon,authenticated,service_role;

-- Distributed test budget. Contains only request timestamps, never notes,
-- generated suggestions, API credentials, or ministry guidance.
create table private.follow_up_next_step_ai_requests (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now()
);
create index follow_up_next_step_ai_budget on private.follow_up_next_step_ai_requests(owner_id,requested_at);
alter table private.follow_up_next_step_ai_requests enable row level security;
revoke all on private.follow_up_next_step_ai_requests from public,anon,authenticated;

create function public.follow_up_next_step_ai_claim(p_contact uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform private.invitation_user_role();
  perform 1 from public.profiles where id=auth.uid() for update;
  if not exists(select 1 from public.follow_up_contacts c
    join public.follow_up_campaigns f on f.id=c.campaign_id and f.status::text='active'
    where c.id=p_contact and c.primary_owner_id=auth.uid()) then
    raise exception 'Contact must be assigned to you in an active campaign.';
  end if;
  delete from private.follow_up_next_step_ai_requests where owner_id=auth.uid() and requested_at<now()-interval '1 hour';
  if exists(select 1 from private.follow_up_next_step_ai_requests where owner_id=auth.uid() and requested_at>now()-interval '1 minute')
    or (select count(*) from private.follow_up_next_step_ai_requests where owner_id=auth.uid())>=10 then return false; end if;
  insert into private.follow_up_next_step_ai_requests(owner_id) values(auth.uid());
  return true;
end $$;
revoke all on function public.follow_up_next_step_ai_claim(uuid) from public,anon;
grant execute on function public.follow_up_next_step_ai_claim(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
