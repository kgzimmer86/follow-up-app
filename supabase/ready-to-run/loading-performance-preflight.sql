-- Read-only metadata checks. No student/account records are returned.
select
  to_regprocedure('public.get_contact_assignment_workspace()') is not null as assignment_reader_exists,
  to_regprocedure('public.community_group_checkin_attention(uuid)') is not null as community_attention_exists,
  to_regclass('public.community_groups') is not null as community_groups_exist,
  to_regclass('public.community_group_memberships') is not null as community_memberships_exist,
  to_regclass('public.community_group_meetings') is not null as community_meetings_exist,
  to_regclass('public.community_group_attendance') is not null as community_attendance_exists;

with source as (
  select pg_get_functiondef(to_regprocedure('public.get_contact_assignment_workspace()')) as definition
), expected as (
  select 'CREATE OR REPLACE FUNCTION public.get_contact_assignment_workspace()' as header,
    E'where c.campaign_id = v_campaign_id\n      and c.status <> ''not_interested''' as contact_filter,
    E'begin\n  if v_user_id is null then' as entry_point
)
select coalesce(
  length(definition) - length(replace(definition, header, '')) = length(header)
  and length(definition) - length(replace(definition, contact_filter, '')) = length(contact_filter)
  and length(definition) - length(replace(definition, entry_point, '')) = length(entry_point), false
) as assignment_shape_matches
from source cross join expected;

-- These may be false before installation; they are informational only.
select
  to_regprocedure('public.get_contact_assignment_page(uuid[])') is not null as new_assignment_reader_already_installed,
  to_regprocedure('public.get_community_group_summaries(uuid[])') is not null as new_group_reader_already_installed;
