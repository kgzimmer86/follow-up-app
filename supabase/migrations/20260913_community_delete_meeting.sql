-- Allow the same authorized leaders/staff who record attendance to delete a meeting.
-- Apply before deploying the matching History delete button.
begin;

create or replace function public.community_delete_meeting(
  p_group_id uuid,
  p_meeting_id uuid,
  p_version integer,
  p_revision integer
) returns void language plpgsql security definer set search_path = '' as $$
declare
  g public.community_groups;
  m public.community_group_meetings;
begin
  -- Locks the group, checks current area/leadership access, and rejects archives.
  g := private.community_require_group(p_group_id);
  select * into m from public.community_group_meetings
    where id = p_meeting_id and group_id = g.id for update;
  if not found then
    raise exception 'This meeting is no longer available. Reload the group.';
  end if;
  if p_version is distinct from m.version or p_revision is distinct from g.revision then
    raise exception 'Attendance or the roster changed. Reload before deleting this meeting.';
  end if;

  -- The existing foreign key removes only this meeting's attendance entries.
  delete from public.community_group_meetings where id = m.id;
  -- Invalidates open checklists so an old save cannot recreate a deleted meeting.
  update public.community_groups set revision = revision + 1, updated_at = now()
    where id = g.id;
end;
$$;

revoke all on function public.community_delete_meeting(uuid,uuid,integer,integer) from public, anon;
grant execute on function public.community_delete_meeting(uuid,uuid,integer,integer) to authenticated;
notify pgrst, 'reload schema';
commit;
