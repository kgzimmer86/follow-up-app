-- Run this COMPLETE file in Supabase SQL Editor before deploying the app changes.
-- Existing assignments intentionally retain an unknown (NULL) assignment time.
-- No roles, relationships, contact statuses, or existing ownership are changed.
begin;

alter table public.follow_up_contacts add column if not exists primary_assigned_at timestamptz;

create or replace function private.track_follow_up_assignment_time()
returns trigger language plpgsql set search_path = '' as $function$
begin
  if TG_OP = 'INSERT' then
    new.primary_assigned_at := case when new.primary_owner_id is not null then now() else null end;
  elsif new.primary_owner_id is distinct from old.primary_owner_id then
    new.primary_assigned_at := case when new.primary_owner_id is not null then now() else null end;
  else
    new.primary_assigned_at := old.primary_assigned_at;
  end if;
  return new;
end;
$function$;
revoke all on function private.track_follow_up_assignment_time() from public;
drop trigger if exists follow_up_track_assignment_time on public.follow_up_contacts;
create trigger follow_up_track_assignment_time before insert or update
on public.follow_up_contacts for each row execute function private.track_follow_up_assignment_time();

CREATE OR REPLACE FUNCTION public.assign_contacts_to_follow_up_user(p_contact_ids uuid[], p_assignee_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
  v_user_role text;
  v_default_area_id uuid;
  v_default_area_type text;
  v_contact_id uuid;
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  select p.role::text
  into v_user_role
  from public.profiles p
  where p.id = v_user_id
    and p.is_active = true;

  if v_user_role is null
     or v_user_role not in (
       'discipler',
       'staff',
       'admin'
     ) then
    raise exception 'Assignment access required';
  end if;

  select c.id
  into v_campaign_id
  from public.follow_up_campaigns c
  where c.status = 'active'
  order by c.created_at desc
  limit 1;

  if v_campaign_id is null then
    raise exception 'No active Follow Up campaign';
  end if;

  if p_contact_ids is null
     or cardinality(p_contact_ids) = 0 then
    raise exception 'Choose at least one contact';
  end if;

  -- Staff handoffs are allowed across ministry areas, only between active
  -- Staff/Admin. Ordinary student/discipler and self-assignment rules below stay intact.
  if v_user_role in ('staff', 'admin') and p_assignee_id <> v_user_id
     and exists (select 1 from public.profiles p where p.id = p_assignee_id
                 and p.is_active = true and p.role in ('staff', 'admin')) then
    if exists (
      select 1 from unnest(p_contact_ids) requested(id)
      where not exists (select 1 from public.follow_up_contacts c
        where c.id = requested.id and c.campaign_id = v_campaign_id
          and c.status <> 'not_interested')
    ) then raise exception 'Choose eligible contacts from the active campaign'; end if;
    update public.follow_up_contacts set primary_owner_id = p_assignee_id
    where id = any(p_contact_ids);
    return;
  end if;

  /*
   * Staff and Disciplers use a default-area boundary.
   * Admin stays movement-wide.
   */
  if v_user_role in ('staff', 'discipler') then
    select
      a.ministry_area_id,
      ma.area_type::text
    into
      v_default_area_id,
      v_default_area_type
    from public.profile_ministry_area_assignments a
    join public.ministry_areas ma
      on ma.id = a.ministry_area_id
    where a.profile_id = v_user_id
      and a.campaign_id = v_campaign_id
      and a.is_default = true
    order by a.created_at asc
    limit 1;
  end if;

  /*
   * Everyone with Assign Contacts access may assign an
   * eligible contact to themselves.
   *
   * Assigning to someone else uses the role-specific
   * restrictions below.
   */
  if p_assignee_id <> v_user_id then

    /*
     * ADMIN:
     * Any active Student Leader or Discipler.
     */
    if v_user_role = 'admin' then

      if not exists (
        select 1
        from public.profiles p
        where p.id = p_assignee_id
          and p.is_active = true
          and p.role in (
            'student_leader',
            'discipler'
          )
      ) then
        raise exception
          'Admin can assign only to active Student Leaders or Disciplers';
      end if;

    /*
     * STAFF:
     * Active Student Leaders or Disciplers whose default
     * area is the Staff member's default area OR any
     * descendant of it.
     *
     * No Staff default area = All Campus.
     */
    elsif v_user_role = 'staff' then

      if not exists (
        with recursive area_tree as (
          select ma.id
          from public.ministry_areas ma
          where ma.id = v_default_area_id

          union all

          select child.id
          from public.ministry_areas child
          join area_tree parent
            on child.parent_id = parent.id
          where child.is_active = true
        )
        select 1
        from public.profiles p
        where p.id = p_assignee_id
          and p.is_active = true
          and p.role in (
            'student_leader',
            'discipler'
          )
          and (
            v_default_area_id is null
            or exists (
              select 1
              from public.profile_ministry_area_assignments pa
              where pa.profile_id = p.id
                and pa.campaign_id = v_campaign_id
                and pa.is_default = true
                and pa.ministry_area_id in (
                  select at.id
                  from area_tree at
                )
            )
          )
      ) then
        raise exception
          'Staff can assign only to themselves or to active Student Leaders and Disciplers in their ministry area';
      end if;

    /*
     * DISCIPLER:
     * Active Student Leaders or Disciplers who are:
     *   depth 1 = direct disciples
     *   depth 2 = direct disciples of those disciples
     */
    else

      if not exists (
        with recursive disciple_tree as (
          select
            r.disciple_id as profile_id,
            1 as depth,
            array[
              v_user_id,
              r.disciple_id
            ]::uuid[] as path
          from public.discipleship_relationships r
          where r.discipler_id = v_user_id
            and r.campaign_id = v_campaign_id
            and r.is_current = true
            and r.ended_at is null

          union all

          select
            r.disciple_id,
            tree.depth + 1,
            tree.path || r.disciple_id
          from disciple_tree tree
          join public.discipleship_relationships r
            on r.discipler_id = tree.profile_id
          where tree.depth < 2
            and r.campaign_id = v_campaign_id
            and r.is_current = true
            and r.ended_at is null
            and not (
              r.disciple_id = any(tree.path)
            )
        )
        select 1
        from disciple_tree tree
        join public.profiles p
          on p.id = tree.profile_id
        where tree.profile_id = p_assignee_id
          and tree.depth between 1 and 2
          and p.is_active = true
          and p.role in (
            'student_leader',
            'discipler'
          )
      ) then
        raise exception
          'You can only assign contacts to yourself, your disciples, or your disciples'' disciples';
      end if;

    end if;

  end if;

  foreach v_contact_id in array p_contact_ids
  loop

    /*
     * ADMIN:
     * Any eligible contact in the active campaign.
     */
    if v_user_role = 'admin' then

      if not exists (
        select 1
        from public.follow_up_contacts c
        where c.id = v_contact_id
          and c.campaign_id = v_campaign_id
          and c.status <> 'not_interested'
      ) then
        raise exception
          'One or more contacts cannot be assigned';
      end if;

    /*
     * STAFF:
     * Contact must be in Staff's default area tree.
     * No default area = All Campus.
     */
    elsif v_user_role = 'staff' then

      if not exists (
        with recursive area_tree as (
          select ma.id
          from public.ministry_areas ma
          where ma.id = v_default_area_id

          union all

          select child.id
          from public.ministry_areas child
          join area_tree parent
            on child.parent_id = parent.id
          where child.is_active = true
        )
        select 1
        from public.follow_up_contacts c
        where c.id = v_contact_id
          and c.campaign_id = v_campaign_id
          and c.status <> 'not_interested'
          and (
            v_default_area_id is null

            or (
              v_default_area_type = 'affinity'
              and exists (
                select 1
                from public.follow_up_contact_affinities affinity
                where affinity.contact_id = c.id
                  and affinity.ministry_area_id in (
                    select at.id
                    from area_tree at
                  )
              )
            )

            or (
              v_default_area_type <> 'affinity'
              and c.ministry_location_id in (
                select at.id
                from area_tree at
              )
            )
          )
      ) then
        raise exception
          'One or more contacts are outside your Staff assignment area';
      end if;

    /*
     * DISCIPLER:
     * Contact must be:
     *   - in the Discipler's default area tree
     *   - unassigned, self-owned, or owned by someone
     *     in their two-level disciple tree.
     */
    else

      if not exists (
        with recursive
        area_tree as (
          select ma.id
          from public.ministry_areas ma
          where ma.id = v_default_area_id

          union all

          select child.id
          from public.ministry_areas child
          join area_tree parent
            on child.parent_id = parent.id
          where child.is_active = true
        ),

        disciple_tree as (
          select
            r.disciple_id as profile_id,
            1 as depth,
            array[
              v_user_id,
              r.disciple_id
            ]::uuid[] as path
          from public.discipleship_relationships r
          where r.discipler_id = v_user_id
            and r.campaign_id = v_campaign_id
            and r.is_current = true
            and r.ended_at is null

          union all

          select
            r.disciple_id,
            tree.depth + 1,
            tree.path || r.disciple_id
          from disciple_tree tree
          join public.discipleship_relationships r
            on r.discipler_id = tree.profile_id
          where tree.depth < 2
            and r.campaign_id = v_campaign_id
            and r.is_current = true
            and r.ended_at is null
            and not (
              r.disciple_id = any(tree.path)
            )
        )

        select 1
        from public.follow_up_contacts c
        where c.id = v_contact_id
          and c.campaign_id = v_campaign_id
          and c.status <> 'not_interested'
          and (
            v_default_area_id is null

            or (
              v_default_area_type = 'affinity'
              and exists (
                select 1
                from public.follow_up_contact_affinities affinity
                where affinity.contact_id = c.id
                  and affinity.ministry_area_id in (
                    select at.id
                    from area_tree at
                  )
              )
            )

            or (
              v_default_area_type <> 'affinity'
              and c.ministry_location_id in (
                select at.id
                from area_tree at
              )
            )
          )
          and (
            c.primary_owner_id is null
            or c.primary_owner_id = v_user_id
            or exists (
              select 1
              from disciple_tree tree
              join public.profiles p
                on p.id = tree.profile_id
              where tree.profile_id =
                c.primary_owner_id
                and tree.depth between 1 and 2
                and p.is_active = true
                and p.role in (
                  'student_leader',
                  'discipler'
                )
            )
          )
      ) then
        raise exception
          'One or more contacts are outside your assignment scope';
      end if;

    end if;

    update public.follow_up_contacts
    set primary_owner_id = p_assignee_id
    where id = v_contact_id
      and campaign_id = v_campaign_id;

  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_contact_assignment_workspace()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_campaign_id uuid;
  v_default_area_id uuid;
  v_default_area_name text;
  v_default_area_type text;
  v_scope text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  select p.role::text
  into v_user_role
  from public.profiles p
  where p.id = v_user_id
    and p.is_active = true;

  if v_user_role is null
     or v_user_role not in (
       'discipler',
       'staff',
       'admin'
     ) then
    raise exception 'Assignment access required';
  end if;

  select c.id
  into v_campaign_id
  from public.follow_up_campaigns c
  where c.status = 'active'
  order by c.created_at desc
  limit 1;

  if v_campaign_id is null then
    raise exception 'No active Follow Up campaign';
  end if;

  if v_user_role in ('staff', 'discipler') then
    select
      a.ministry_area_id,
      ma.name::text,
      ma.area_type::text
    into
      v_default_area_id,
      v_default_area_name,
      v_default_area_type
    from public.profile_ministry_area_assignments a
    join public.ministry_areas ma
      on ma.id = a.ministry_area_id
    where a.profile_id = v_user_id
      and a.campaign_id = v_campaign_id
      and a.is_default = true
    order by a.created_at asc
    limit 1;
  end if;

  if v_user_role = 'admin' then
    v_scope := 'All Campus';
  elsif v_default_area_id is null then
    v_scope := 'All Campus';
  else
    v_scope := v_default_area_name;
  end if;

  with recursive
  area_tree as (
    select ma.id
    from public.ministry_areas ma
    where ma.id = v_default_area_id

    union all

    select child.id
    from public.ministry_areas child
    join area_tree parent
      on child.parent_id = parent.id
    where child.is_active = true
  ),

  disciple_tree as (
    select
      r.disciple_id as profile_id,
      1 as depth,
      array[
        v_user_id,
        r.disciple_id
      ]::uuid[] as path
    from public.discipleship_relationships r
    where r.discipler_id = v_user_id
      and r.campaign_id = v_campaign_id
      and r.is_current = true
      and r.ended_at is null

    union all

    select
      r.disciple_id,
      tree.depth + 1,
      tree.path || r.disciple_id
    from disciple_tree tree
    join public.discipleship_relationships r
      on r.discipler_id = tree.profile_id
    where tree.depth < 2
      and r.campaign_id = v_campaign_id
      and r.is_current = true
      and r.ended_at is null
      and not (
        r.disciple_id = any(tree.path)
      )
  ),

  eligible_assignees as (
    select distinct
      p.id,
      coalesce(
        nullif(
          btrim(p.display_name),
          ''
        ),
        'Unnamed leader'
      )::text as display_name,
      p.role::text as role,

      (
        select ma.name::text
        from public.profile_ministry_area_assignments pa
        join public.ministry_areas ma
          on ma.id = pa.ministry_area_id
        where pa.profile_id = p.id
          and pa.campaign_id = v_campaign_id
          and pa.is_default = true
        order by pa.created_at asc
        limit 1
      ) as area_name

    from public.profiles p
    where p.is_active = true
      and (p.role in ('student_leader', 'discipler')
        or (v_user_role in ('staff', 'admin') and p.role in ('staff', 'admin')))
      and p.id <> v_user_id
      and (
        /*
         * Admin: movement-wide.
         */
        v_user_role = 'admin'
        or (v_user_role = 'staff' and p.role in ('staff', 'admin'))

        /*
         * Staff: default area + every descendant area.
         * No default area = All Campus.
         */
        or (
          v_user_role = 'staff'
          and (
            v_default_area_id is null

            or exists (
              select 1
              from public.profile_ministry_area_assignments pa
              where pa.profile_id = p.id
                and pa.campaign_id = v_campaign_id
                and pa.is_default = true
                and pa.ministry_area_id in (
                  select at.id
                  from area_tree at
                )
            )
          )
        )

        /*
         * Discipler: direct disciples + their direct disciples.
         */
        or (
          v_user_role = 'discipler'
          and exists (
            select 1
            from disciple_tree dt
            where dt.profile_id = p.id
              and dt.depth between 1 and 2
          )
        )
      )
  ),

  eligible_contacts as (
    select
      c.id,
      coalesce(
        nullif(
          btrim(s.display_name),
          ''
        ),
        nullif(
          btrim(s.uniqname),
          ''
        ),
        'Unnamed contact'
      )::text as display_name,
      c.status::text as status,
      c.primary_owner_id,
      owner.display_name::text as primary_owner_name,
      coalesce(
        location.name::text,
        c.raw_location_text::text
      ) as location_name,
      c.house_name::text as house_name,
      c.room_or_address::text as room_or_address,
      c.location_resolution::text as location_resolution,
      c.jesus_interest::text as jesus_interest,
      c.community_interest::text as community_interest,
      c.interview_interest::text as interview_interest

    from public.follow_up_contacts c
    join public.students s
      on s.id = c.student_id
    left join public.profiles owner
      on owner.id = c.primary_owner_id
    left join public.ministry_areas location
      on location.id = c.ministry_location_id

    where c.campaign_id = v_campaign_id
      and c.status <> 'not_interested'
      and (
        /*
         * Admin: all eligible active-campaign contacts.
         */
        v_user_role = 'admin'

        /*
         * Staff: contacts in their default area tree.
         * No default area = All Campus.
         */
        or (
          v_user_role = 'staff'
          and (
            v_default_area_id is null

            or (
              v_default_area_type = 'affinity'
              and exists (
                select 1
                from public.follow_up_contact_affinities affinity
                where affinity.contact_id = c.id
                  and affinity.ministry_area_id in (
                    select at.id
                    from area_tree at
                  )
              )
            )

            or (
              v_default_area_type <> 'affinity'
              and c.ministry_location_id in (
                select at.id
                from area_tree at
              )
            )
          )
        )

        /*
         * Discipler: contacts in their default area tree,
         * limited to unassigned / self-owned / owned by
         * someone in their two-level disciple tree.
         */
        or (
          v_user_role = 'discipler'
          and (
            v_default_area_id is null

            or (
              v_default_area_type = 'affinity'
              and exists (
                select 1
                from public.follow_up_contact_affinities affinity
                where affinity.contact_id = c.id
                  and affinity.ministry_area_id in (
                    select at.id
                    from area_tree at
                  )
              )
            )

            or (
              v_default_area_type <> 'affinity'
              and c.ministry_location_id in (
                select at.id
                from area_tree at
              )
            )
          )
          and (
            c.primary_owner_id is null
            or c.primary_owner_id = v_user_id
            or exists (
              select 1
              from disciple_tree dt
              join public.profiles p
                on p.id = dt.profile_id
              where dt.profile_id = c.primary_owner_id
                and dt.depth between 1 and 2
                and p.is_active = true
                and p.role in (
                  'student_leader',
                  'discipler'
                )
            )
          )
        )
      )
  )

  select jsonb_build_object(
    'role',
    v_user_role,

    'scope',
    v_scope,

    'assignees',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            a.id,

            'display_name',
            a.display_name,

            'role',
            a.role,

            'area_name',
            a.area_name
          )
          order by
            a.display_name,
            a.id
        )
        from eligible_assignees a
      ),
      '[]'::jsonb
    ),

    'contacts',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            c.id,

            'display_name',
            c.display_name,

            'status',
            c.status,

            'primary_owner_id',
            c.primary_owner_id,

            'primary_owner_name',
            c.primary_owner_name,

            'location_name',
            c.location_name,

            'house_name',
            c.house_name,

            'room_or_address',
            c.room_or_address,

            'location_resolution',
            c.location_resolution,

            'jesus_interest',
            c.jesus_interest,

            'community_interest',
            c.community_interest,

            'interview_interest',
            c.interview_interest
          )
          order by
            c.display_name,
            c.id
        )
        from eligible_contacts c
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_disciples_dashboard()
 RETURNS TABLE(disciple_id uuid, display_name text, email text, role text, area_name text, direct_disciple_count bigint, chain_descendant_count bigint, primary_contacts bigint, week_interactions bigint, week_spiritual_conversations bigint, week_gospel_conversations bigint, go_backs bigint, unattempted bigint, stale_go_backs bigint, last_activity_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
  v_week_start timestamptz;
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.is_active = true
      and p.role in (
        'discipler',
        'staff',
        'admin'
      )
  ) then
    raise exception 'My Disciples access required';
  end if;

  select c.id
  into v_campaign_id
  from public.follow_up_campaigns c
  where c.status = 'active'
  order by c.created_at desc
  limit 1;

  if v_campaign_id is null then
    raise exception 'No active Follow Up campaign';
  end if;

  v_week_start :=
    date_trunc(
      'week',
      now() at time zone 'America/Detroit'
    ) at time zone 'America/Detroit';

  return query
  with recursive direct_disciples as (
    select
      r.disciple_id,
      p.display_name,
      p.email,
      p.role
    from public.discipleship_relationships r
    join public.profiles p
      on p.id = r.disciple_id
    where r.discipler_id = v_user_id
      and r.campaign_id = v_campaign_id
      and r.is_current = true
      and r.ended_at is null
      and p.is_active = true
  ),

  chain as (
    -- Each direct disciple is the root of one
    -- branch of the user's discipleship chain.
    select
      d.disciple_id as root_disciple_id,
      d.disciple_id as profile_id,
      array[d.disciple_id]::uuid[] as path
    from direct_disciples d

    union all

    -- Walk downward through every current
    -- discipleship relationship.
    select
      c.root_disciple_id,
      r.disciple_id,
      c.path || r.disciple_id
    from chain c
    join public.discipleship_relationships r
      on r.discipler_id = c.profile_id
      and r.campaign_id = v_campaign_id
      and r.is_current = true
      and r.ended_at is null
    join public.profiles p
      on p.id = r.disciple_id
      and p.is_active = true
    where not exists (select 1 from direct_disciples root
      where root.disciple_id = c.root_disciple_id and root.role in ('staff', 'admin'))
      and not (r.disciple_id = any(c.path))
  ),

  scope_profiles as (
    select distinct
      root_disciple_id,
      profile_id
    from chain
  )

  select
    d.disciple_id,

    coalesce(
      d.display_name,
      d.email,
      'Follow Up leader'
    )::text,

    d.email::text,
    d.role::text,

    (
      select ma.name
      from public.profile_ministry_area_assignments assignment
      join public.ministry_areas ma
        on ma.id = assignment.ministry_area_id
      where assignment.profile_id =
        d.disciple_id
        and assignment.campaign_id =
          v_campaign_id
      order by
        assignment.is_default desc,
        assignment.created_at asc
      limit 1
    )::text as area_name,

    (
      select count(*)
      from public.discipleship_relationships child
      join public.profiles child_profile
        on child_profile.id =
          child.disciple_id
        and child_profile.is_active = true
      where d.role not in ('staff', 'admin')
        and child.discipler_id = d.disciple_id
        and child.campaign_id =
          v_campaign_id
        and child.is_current = true
        and child.ended_at is null
    )::bigint as direct_disciple_count,

    (
      select greatest(
        count(*) - 1,
        0
      )
      from scope_profiles sp
      where sp.root_disciple_id =
        d.disciple_id
    )::bigint as chain_descendant_count,

    (
      select count(*)
      from public.follow_up_contacts contact
      where contact.campaign_id =
        v_campaign_id
        and contact.primary_owner_id in (
          select sp.profile_id
          from scope_profiles sp
          where sp.root_disciple_id =
            d.disciple_id
        )
    )::bigint as primary_contacts,

    (
      select count(*)
      from public.follow_up_events event
      where event.event_type =
        'interaction'
        and event.occurred_at >=
          v_week_start
        and event.performed_by in (
          select sp.profile_id
          from scope_profiles sp
          where sp.root_disciple_id =
            d.disciple_id
        )
    )::bigint as week_interactions,

    (
      select count(*)
      from public.follow_up_events event
      where event.event_type =
        'interaction'
        and event.occurred_at >=
          v_week_start
        and (
          event.had_spiritual_conversation = true
          or event.interview_completed = true
          or event.kgp_shared = true
          or event.received_christ = true
        )
        and event.performed_by in (
          select sp.profile_id
          from scope_profiles sp
          where sp.root_disciple_id =
            d.disciple_id
        )
    )::bigint
      as week_spiritual_conversations,

    (
      select count(*)
      from public.follow_up_events event
      where event.event_type =
        'interaction'
        and event.occurred_at >=
          v_week_start
        and event.kgp_shared = true
        and event.performed_by in (
          select sp.profile_id
          from scope_profiles sp
          where sp.root_disciple_id =
            d.disciple_id
        )
    )::bigint
      as week_gospel_conversations,

    (
      select count(*)
      from public.follow_up_contacts contact
      where contact.campaign_id =
        v_campaign_id
        and contact.status = 'go_back'
        and contact.coaching_correction_exempt_owner_id
          is distinct from contact.primary_owner_id
        and contact.primary_owner_id in (
          select sp.profile_id
          from scope_profiles sp
          where sp.root_disciple_id =
            d.disciple_id
        )
    )::bigint as go_backs,

    (
      select count(*)
      from public.follow_up_contacts contact
      where contact.campaign_id =
        v_campaign_id
        and contact.primary_owner_id in (
          select sp.profile_id
          from scope_profiles sp
          where sp.root_disciple_id =
            d.disciple_id
        )
        and not exists (
          select 1
          from public.follow_up_events event
          where event.contact_id =
            contact.id
        )
        and contact.coaching_correction_exempt_owner_id
          is distinct from contact.primary_owner_id
    )::bigint as unattempted,

    (
      select count(*)
      from public.follow_up_contacts contact
      where contact.campaign_id =
        v_campaign_id
        and contact.status = 'go_back'
        and contact.coaching_correction_exempt_owner_id
          is distinct from contact.primary_owner_id
        and contact.primary_owner_id in (
          select sp.profile_id
          from scope_profiles sp
          where sp.root_disciple_id =
            d.disciple_id
        )
        and (
          select max(event.occurred_at)
          from public.follow_up_events event
          where event.contact_id =
            contact.id
        ) is not null
        and (
          select max(event.occurred_at)
          from public.follow_up_events event
          where event.contact_id =
            contact.id
        ) < now() - interval '7 days'
    )::bigint as stale_go_backs,

    (
      select max(event.occurred_at)
      from public.follow_up_events event
      where event.performed_by in (
        select sp.profile_id
        from scope_profiles sp
        where sp.root_disciple_id =
          d.disciple_id
      )
    ) as last_activity_at

  from direct_disciples d
  order by
    coalesce(
      d.display_name,
      d.email
    );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_disciple_coaching_detail(p_disciple_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_campaign_id uuid;
  v_week_start timestamptz;
  v_result jsonb;
  v_personal_only boolean := false;
begin
  if v_user_id is null then
    raise exception 'You must be signed in';
  end if;

  select p.role::text
  into v_user_role
  from public.profiles p
  where p.id = v_user_id
    and p.is_active = true;

  if v_user_role is null
     or v_user_role not in (
       'discipler',
       'staff',
       'admin'
     ) then
    raise exception 'My Disciples access required';
  end if;

  select c.id
  into v_campaign_id
  from public.follow_up_campaigns c
  where c.status = 'active'
  order by c.created_at desc
  limit 1;

  if v_campaign_id is null then
    raise exception 'No active Follow Up campaign';
  end if;

  select coalesce(p.role in ('staff', 'admin'), false) into v_personal_only
  from public.profiles p where p.id = p_disciple_id and p.is_active = true;
  v_personal_only := coalesce(v_personal_only, false);
  if v_personal_only and not exists (
    select 1 from public.discipleship_relationships r
    where r.discipler_id = v_user_id and r.disciple_id = p_disciple_id
      and r.campaign_id = v_campaign_id and r.is_current = true and r.ended_at is null
  ) then raise exception 'This person is not in your discipleship chain'; end if;

  v_week_start :=
    date_trunc(
      'week',
      now() at time zone 'America/Detroit'
    ) at time zone 'America/Detroit';

  /*
   * Coaching-page access:
   * - Disciplers keep the existing discipleship-chain boundary.
   * - Staff/Admin may open the coaching page for any active
   *   Student Leader or Discipler shown in management views.
   *
   * Assignment permissions are still enforced separately by the
   * assignment RPCs, so opening a coaching page does not grant a
   * Staff user broader assignment authority.
   */
  if v_user_role = 'discipler' then
    if not exists (
      with recursive my_chain as (
        select
          r.disciple_id as profile_id,
          array[
            v_user_id,
            r.disciple_id
          ]::uuid[] as path
        from public.discipleship_relationships r
        join public.profiles p
          on p.id = r.disciple_id
          and p.is_active = true
        where r.discipler_id = v_user_id
          and r.campaign_id = v_campaign_id
          and r.is_current = true
          and r.ended_at is null

        union all

        select
          r.disciple_id,
          c.path || r.disciple_id
        from my_chain c
        join public.discipleship_relationships r
          on r.discipler_id = c.profile_id
          and r.campaign_id = v_campaign_id
          and r.is_current = true
          and r.ended_at is null
        join public.profiles p
          on p.id = r.disciple_id
          and p.is_active = true
        where not (
          r.disciple_id = any(c.path)
        )
      )
      select 1
      from my_chain
      where profile_id = p_disciple_id
    ) then
      raise exception
        'This person is not in your discipleship chain';
    end if;
  else
    if not exists (
      select 1
      from public.profiles p
      where p.id = p_disciple_id
        and p.is_active = true
        and (p.role in ('student_leader', 'discipler') or v_personal_only)
    ) then
      raise exception
        'This leader is not available for coaching';
    end if;
  end if;

  with recursive target_chain as (
    /*
     * The selected disciple themselves.
     */
    select
      p_disciple_id as profile_id,
      array[p_disciple_id]::uuid[] as path

    union all

    /*
     * Everyone downstream from them.
     */
    select
      r.disciple_id,
      c.path || r.disciple_id
    from target_chain c
    join public.discipleship_relationships r
      on r.discipler_id = c.profile_id
      and r.campaign_id = v_campaign_id
      and r.is_current = true
      and r.ended_at is null
    join public.profiles p
      on p.id = r.disciple_id
      and p.is_active = true
    where not v_personal_only and not (r.disciple_id = any(c.path))
  ),

  branch_people as (
    select distinct profile_id
    from target_chain
  ),

  target_profile as (
    select
      p.id,
      p.display_name,
      p.email,
      p.role
    from public.profiles p
    where p.id = p_disciple_id
  ),

  direct_disciples as (
    select
      p.id,
      p.display_name,
      p.email,
      p.role,

      (
        select ma.name
        from public.profile_ministry_area_assignments a
        join public.ministry_areas ma
          on ma.id = a.ministry_area_id
        where a.profile_id = p.id
          and a.campaign_id = v_campaign_id
        order by
          a.is_default desc,
          a.created_at asc
        limit 1
      ) as area_name,

      (
        select count(*)
        from public.discipleship_relationships child
        join public.profiles child_profile
          on child_profile.id =
            child.disciple_id
          and child_profile.is_active = true
        where child.discipler_id = p.id
          and child.campaign_id =
            v_campaign_id
          and child.is_current = true
          and child.ended_at is null
      )::bigint as direct_disciple_count

    from public.discipleship_relationships r
    join public.profiles p
      on p.id = r.disciple_id
      and p.is_active = true
    where not v_personal_only and r.discipler_id = p_disciple_id
      and r.campaign_id = v_campaign_id
      and r.is_current = true
      and r.ended_at is null
  ),

  contact_last_activity as (
    select
      e.contact_id,
      max(e.occurred_at) as last_activity_at
    from public.follow_up_events e
    group by e.contact_id
  ),

  branch_contacts as (
    select
      c.id,
      c.student_id,
      c.primary_owner_id,
      c.status,
      c.ministry_location_id,
      c.house_name,
      c.room_or_address,
      c.coaching_correction_exempt_owner_id,
      cla.last_activity_at
    from public.follow_up_contacts c
    left join contact_last_activity cla
      on cla.contact_id = c.id
    where c.campaign_id = v_campaign_id
      and c.primary_owner_id in (
        select profile_id
        from branch_people
      )
  ),

  attention_contacts as (
    select
      c.id,
      c.student_id,
      c.primary_owner_id,
      c.status,
      c.ministry_location_id,
      c.house_name,
      c.room_or_address,
      c.last_activity_at,

      case
        when c.last_activity_at is null
          and c.coaching_correction_exempt_owner_id
            is distinct from c.primary_owner_id
          then 'unattempted'

        when c.status = 'go_back'
          and c.coaching_correction_exempt_owner_id
            is distinct from c.primary_owner_id
          and c.last_activity_at <
            now() - interval '7 days'
          then 'stale_go_back'

        else null
      end as attention_type

    from branch_contacts c
    where
      (
        c.last_activity_at is null
        and c.coaching_correction_exempt_owner_id
          is distinct from c.primary_owner_id
      )

      or (
        c.status = 'go_back'
        and c.coaching_correction_exempt_owner_id
          is distinct from c.primary_owner_id
        and c.last_activity_at <
          now() - interval '7 days'
      )
  )

  select jsonb_build_object(
    'profile',
    (
      select jsonb_build_object(
        'id',
        p.id,

        'display_name',
        coalesce(
          p.display_name,
          p.email,
          'Follow Up leader'
        ),

        'email',
        p.email,

        'role',
        p.role,

        'area_name',
        (
          select ma.name
          from public.profile_ministry_area_assignments a
          join public.ministry_areas ma
            on ma.id = a.ministry_area_id
          where a.profile_id = p.id
            and a.campaign_id =
              v_campaign_id
          order by
            a.is_default desc,
            a.created_at asc
          limit 1
        )
      )
      from target_profile p
    ),

    'metrics',
    jsonb_build_object(
      'week_interactions',
      (
        select count(*)
        from public.follow_up_events e
        where e.event_type = 'interaction'
          and e.occurred_at >=
            v_week_start
          and e.performed_by in (
            select profile_id
            from branch_people
          )
      ),

      'week_spiritual_conversations',
      (
        select count(*)
        from public.follow_up_events e
        where e.event_type = 'interaction'
          and e.occurred_at >=
            v_week_start
          and (
            e.had_spiritual_conversation = true
            or e.interview_completed = true
            or e.kgp_shared = true
            or e.received_christ = true
          )
          and e.performed_by in (
            select profile_id
            from branch_people
          )
      ),

      'week_gospel_conversations',
      (
        select count(*)
        from public.follow_up_events e
        where e.event_type = 'interaction'
          and e.occurred_at >=
            v_week_start
          and e.kgp_shared = true
          and e.performed_by in (
            select profile_id
            from branch_people
          )
      ),

      'go_backs',
      (
        select count(*)
        from branch_contacts c
        where c.status = 'go_back'
          and c.coaching_correction_exempt_owner_id
            is distinct from c.primary_owner_id
      ),

      'unattempted',
      (
        select count(*)
        from attention_contacts c
        where c.attention_type =
          'unattempted'
      ),

      'stale_go_backs',
      (
        select count(*)
        from attention_contacts c
        where c.attention_type =
          'stale_go_back'
      ),

      'direct_primary_contacts',
      (
        select count(*)
        from public.follow_up_contacts c
        where c.campaign_id =
          v_campaign_id
          and c.primary_owner_id =
            p_disciple_id
      ),

      'chain_people',
      (
        select count(*)
        from branch_people
      )
    ),

    'direct_disciples',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            d.id,

            'display_name',
            coalesce(
              d.display_name,
              d.email,
              'Follow Up leader'
            ),

            'email',
            d.email,

            'role',
            d.role,

            'area_name',
            d.area_name,

            'direct_disciple_count',
            d.direct_disciple_count
          )
          order by
            coalesce(
              d.display_name,
              d.email
            )
        )
        from direct_disciples d
      ),
      '[]'::jsonb
    ),

    'assigned_contacts',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            c.id,

            'display_name',
            s.display_name,

            'status',
            c.status,

            'location',
            ma.name,

            'house_name',
            c.house_name,

            'room_or_address',
            c.room_or_address,

            'last_activity_at',
            cla.last_activity_at
          )
          order by s.display_name
        )
        from public.follow_up_contacts c
        join public.students s
          on s.id = c.student_id
        left join public.ministry_areas ma
          on ma.id =
            c.ministry_location_id
        left join contact_last_activity cla
          on cla.contact_id = c.id
        where c.campaign_id =
          v_campaign_id
          and c.primary_owner_id =
            p_disciple_id
      ),
      '[]'::jsonb
    ),

    'attention_contacts',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
            c.id,

            'display_name',
            s.display_name,

            'owner_name',
            coalesce(
              owner.display_name,
              owner.email,
              'Follow Up leader'
            ),

            'status',
            c.status,

            'attention_type',
            c.attention_type,

            'location',
            ma.name,

            'house_name',
            c.house_name,

            'room_or_address',
            c.room_or_address,

            'last_activity_at',
            c.last_activity_at
          )
          order by
            case
              when c.attention_type =
                'unattempted'
                then 0
              else 1
            end,
            s.display_name
        )
        from attention_contacts c
        join public.students s
          on s.id = c.student_id
        left join public.profiles owner
          on owner.id =
            c.primary_owner_id
        left join public.ministry_areas ma
          on ma.id =
            c.ministry_location_id
      ),
      '[]'::jsonb
    ),

    'recent_activity',
    coalesce(
      (
        select jsonb_agg(activity_row)
        from (
          select jsonb_build_object(
            'id',
            e.id,

            'event_type',
            e.event_type,

            'occurred_at',
            e.occurred_at,

            'notes',
            e.notes,

            'contact_id',
            e.contact_id,

            'contact_name',
            s.display_name,

            'performer_id',
            e.performed_by,

            'performer_name',
            coalesce(
              performer.display_name,
              performer.email,
              'Follow Up leader'
            ),

            'had_spiritual_conversation',
            e.had_spiritual_conversation,

            'interview_completed',
            e.interview_completed,

            'kgp_shared',
            e.kgp_shared,

            'received_christ',
            e.received_christ
          ) as activity_row

          from public.follow_up_events e
          join public.follow_up_contacts c
            on c.id = e.contact_id
          join public.students s
            on s.id = c.student_id
          left join public.profiles performer
            on performer.id =
              e.performed_by
          where c.campaign_id =
            v_campaign_id
            and e.performed_by in (
              select profile_id
              from branch_people
            )
          order by e.occurred_at desc
          limit 8
        ) recent
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$function$;

-- The contact dropdown needs direct disciples, not dashboard activity totals.
create or replace function public.get_contact_primary_choices(p_contact_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_campaign_id uuid;
  v_workspace jsonb;
  v_eligible boolean;
  v_result jsonb;
begin
  select p.role::text into v_role from public.profiles p where p.id = v_user_id and p.is_active = true;
  if v_user_id is null or v_role is null or v_role not in ('discipler','staff','admin') then
    raise exception 'Assignment access required';
  end if;
  select c.id into v_campaign_id from public.follow_up_campaigns c where c.status = 'active' order by c.created_at desc limit 1;
  if not exists (select 1 from public.follow_up_contacts c where c.id = p_contact_id
    and c.campaign_id = v_campaign_id and c.status <> 'not_interested') then return '[]'::jsonb; end if;
  v_workspace := public.get_contact_assignment_workspace();
  v_eligible := exists (select 1 from jsonb_array_elements(v_workspace->'contacts') c where c->>'id' = p_contact_id::text);
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'display_name',coalesce(nullif(btrim(p.display_name),''),p.email,'Follow Up leader'),
    'group',case when p.role in ('staff','admin') then 'staff' else 'disciples' end)
    order by p.display_name,p.id),'[]'::jsonb) into v_result
  from public.profiles p
  where p.is_active = true and p.id <> v_user_id and (
    (v_role in ('staff','admin') and p.role in ('staff','admin'))
    or (v_eligible and p.role in ('student_leader','discipler')
      and exists (select 1 from jsonb_array_elements(v_workspace->'assignees') a where a->>'id' = p.id::text)
      and exists (select 1 from public.discipleship_relationships r
        where r.discipler_id = v_user_id and r.disciple_id = p.id and r.campaign_id = v_campaign_id
          and r.is_current = true and r.ended_at is null))
  );
  return v_result;
end;
$function$;
revoke all on function public.get_contact_primary_choices(uuid) from public;
grant execute on function public.get_contact_primary_choices(uuid) to authenticated;

-- One source for the badge and the matching lists. Never accepts another user's ID.
create or replace function private.my_contact_attention_rows()
returns table(contact_id uuid, unattempted boolean, stale_go_back boolean, new_believer boolean)
language plpgsql security definer set search_path = '' as $function$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'You must be signed in'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_user_id and p.is_active = true and p.role <> 'pending') then
    raise exception 'Active Follow Up access required'; end if;
  return query
  select c.id, not activity.has_owner_interaction,
    coalesce(c.status::text = 'go_back' and activity.last_activity_at <= now() - interval '7 days', false),
    coalesce(c.received_christ_at <= now() - interval '24 hours' and not activity.has_later_interaction, false)
  from public.follow_up_contacts c
  join public.follow_up_campaigns campaign on campaign.id = c.campaign_id
  cross join lateral (
    select
      coalesce(bool_or(e.event_type::text = 'interaction' and e.performed_by = v_user_id
        and (c.primary_assigned_at is null or e.occurred_at >= c.primary_assigned_at)), false) as has_owner_interaction,
      max(e.occurred_at) as last_activity_at,
      coalesce(bool_or(e.event_type::text = 'interaction' and e.occurred_at > c.received_christ_at), false) as has_later_interaction
    from public.follow_up_events e where e.contact_id = c.id
  ) activity
  where c.primary_owner_id = v_user_id and campaign.status::text = 'active';
end;
$function$;
revoke all on function private.my_contact_attention_rows() from public, authenticated;

create or replace function public.get_my_contact_attention()
returns jsonb language sql security definer set search_path = '' as $function$
  select jsonb_build_object(
    'unattempted', count(*) filter (where unattempted),
    'staleGoBacks', count(*) filter (where stale_go_back),
    'newBelievers', count(*) filter (where new_believer),
    'total', count(*) filter (where unattempted or stale_go_back or new_believer)
  ) from private.my_contact_attention_rows();
$function$;
revoke all on function public.get_my_contact_attention() from public;
grant execute on function public.get_my_contact_attention() to authenticated;

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
      c.primary_assigned_at
    from matches m join public.follow_up_contacts c on c.id = m.contact_id
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
