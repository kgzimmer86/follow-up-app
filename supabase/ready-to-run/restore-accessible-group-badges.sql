-- OPTIONAL ROLLBACK ONLY: restore notifications for ALL accessible groups.
-- Do not run alongside the forward migration.
begin;

create or replace function public.community_workspace_counts()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  invitations jsonb;
  attention bigint;
begin
  invitations := public.community_invite_counts();
  select count(*) into attention from private.community_checkin_attention();
  return invitations || jsonb_build_object('groups', attention);
end;
$$;

revoke all on function public.community_workspace_counts() from public, anon;
grant execute on function public.community_workspace_counts() to authenticated;

commit;
