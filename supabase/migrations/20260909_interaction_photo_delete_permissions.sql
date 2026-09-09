-- Run this complete file in the Supabase SQL Editor.
-- Tightens photo deletion only. Does not delete or modify photos or history.
begin;

create or replace function private.can_delete_follow_up_interaction_photo(
  p_object_name text,
  p_owner_id text
)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.profiles profile
    join public.follow_up_contacts contact
      on contact.id::text = split_part(p_object_name, '/', 2)
    join public.follow_up_campaigns campaign
      on campaign.id = contact.campaign_id
    where profile.id = (select auth.uid())
      and profile.is_active = true
      and profile.role::text in ('student_leader', 'discipler', 'staff', 'admin')
      and campaign.status::text = 'active'
      and split_part(p_object_name, '/', 1) = 'interaction-attachments'
      and (
        profile.role::text in ('staff', 'admin')
        or (
          p_owner_id = profile.id::text
          -- Check all references, even if another RLS policy hides an event.
          -- Once the interaction is deleted, Storage ownership still identifies
          -- the uploader for the app's subsequent Storage API removal.
          and not exists (
            select 1
            from public.follow_up_events event
            where event.attachment_path = p_object_name
              and event.performed_by is distinct from profile.id
          )
        )
      )
  );
$function$;

revoke all on function private.can_delete_follow_up_interaction_photo(text, text)
  from public, anon, authenticated;
grant execute on function private.can_delete_follow_up_interaction_photo(text, text)
  to anon, authenticated;

drop policy if exists "Interaction photo deletion requires owner or staff"
  on storage.objects;

-- Restrictive means another broad allow-policy cannot override this check.
-- Existing permissions for other buckets and for uploads/views are unchanged.
create policy "Interaction photo deletion requires owner or staff"
on storage.objects
as restrictive
for delete
to public
using (
  bucket_id <> 'follow-up-interaction-photos'
  or private.can_delete_follow_up_interaction_photo(name, owner_id)
);

commit;
