-- Read-only inspection for the proposed Text Attempt feature.
-- Returns database definitions only; does not read student/contact records
-- or change the database. Run in the Supabase SQL Editor and share the results.

with target_tables as (
  select c.oid, c.relname
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('follow_up_events', 'follow_up_contacts')
), definitions as (
  select
    'column'::text as section,
    t.relname || '.' || a.attname as object_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod)
      || case when a.attnotnull then ' NOT NULL' else '' end
      || coalesce(' DEFAULT ' || pg_catalog.pg_get_expr(d.adbin, d.adrelid), '')
      as definition
  from target_tables t
  join pg_catalog.pg_attribute a on a.attrelid = t.oid
  left join pg_catalog.pg_attrdef d
    on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attnum > 0 and not a.attisdropped

  union all

  select 'constraint', t.relname || '.' || c.conname,
    pg_catalog.pg_get_constraintdef(c.oid)
  from target_tables t
  join pg_catalog.pg_constraint c on c.conrelid = t.oid

  union all

  select 'trigger', t.relname || '.' || g.tgname,
    pg_catalog.pg_get_triggerdef(g.oid)
  from target_tables t
  join pg_catalog.pg_trigger g on g.tgrelid = t.oid
  where not g.tgisinternal

  union all

  select 'policy', p.tablename || '.' || p.policyname,
    pg_catalog.jsonb_build_object(
      'roles', p.roles, 'command', p.cmd,
      'using', p.qual, 'check', p.with_check
    )::text
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('follow_up_events', 'follow_up_contacts')

  union all

  select 'function', p.oid::regprocedure::text,
    pg_catalog.pg_get_functiondef(p.oid)
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
    and (
      p.prosrc ilike '%follow_up_events%'
      or p.proname in (
        'log_knock', 'log_interaction',
        'update_follow_up_event', 'delete_follow_up_event'
      )
      or p.oid in (
        select g.tgfoid
        from pg_catalog.pg_trigger g
        join target_tables t on t.oid = g.tgrelid
        where not g.tgisinternal
      )
    )
)
select section, object_name, definition
from definitions
order by section, object_name;
