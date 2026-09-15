-- Notification totals reflect groups the signed-in user explicitly leads.
-- Group access, per-group check-in details, and invitation rules are unchanged.
begin;

do $$
begin
  if to_regprocedure('private.community_checkin_attention(uuid)') is null
     or to_regprocedure('public.community_invite_counts()') is null
     or to_regprocedure('public.community_workspace_counts()') is null then
    raise exception 'Existing Community badge functions are required. No changes applied.';
  end if;
end;
$$;

create or replace function public.community_workspace_counts()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  invitations jsonb;
  attention bigint;
begin
  -- Retains the existing active-account check and personal invitation totals.
  invitations := public.community_invite_counts();

  select count(*) into attention
  from public.community_group_leaders leader
  cross join lateral private.community_checkin_attention(leader.group_id) attention_row
  where leader.profile_id = auth.uid();

  return invitations || jsonb_build_object('groups', attention);
end;
$$;

revoke all on function public.community_workspace_counts() from public, anon;
grant execute on function public.community_workspace_counts() to authenticated;

commit;
