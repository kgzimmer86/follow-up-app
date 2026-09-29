import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('staff can assign an active leader from another campus without granting area staff access', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role authenticated; create role anon; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table profiles(id uuid primary key,role text,is_active boolean default true);
    create table follow_up_campaigns(id uuid primary key,status text,starts_on date,ends_on date);
    create table ministry_areas(id uuid primary key,parent_id uuid,is_active boolean default true);
    create table profile_ministry_area_assignments(profile_id uuid,campaign_id uuid,ministry_area_id uuid,is_default boolean);
    create table students(id uuid primary key,phone text,gender_raw text);
    create table follow_up_contacts(id uuid primary key default gen_random_uuid(),campaign_id uuid references follow_up_campaigns on delete cascade,student_id uuid references students,status text default 'uncontacted',phone text,gender_raw text,contact_origin text,field_added_by uuid,location_resolution text,unique(campaign_id,student_id));
    create table follow_up_contact_merge_log(id uuid primary key default gen_random_uuid(),kept_student_id uuid,merged_student_id uuid);
    create function set_follow_up_contact_status(p_contact_id uuid,p_status text) returns void language sql as $$update public.follow_up_contacts set status=p_status where id=p_contact_id$$;
  `)
  for (const name of ['20260911_community_groups_foundation', '20260928_community_cross_area_leaders']) {
    await db.exec(await readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'))
  }
  const [campaign, north, south, staff, leader, crossCampus, outsider] = Array.from({ length: 7 }, () => randomUUID())
  await db.query("insert into follow_up_campaigns values($1,'active',current_date-1,current_date+30)", [campaign])
  for (const area of [north, south]) await db.query('insert into ministry_areas(id) values($1)', [area])
  for (const [id, role, area] of [[staff, 'staff', north], [leader, 'student_leader', north], [crossCampus, 'student_leader', south], [outsider, 'staff', south]]) {
    await db.query('insert into profiles(id,role) values($1,$2)', [id, role])
    await db.query('insert into profile_ministry_area_assignments values($1,$2,$3,true)', [id, campaign, area])
  }
  const asUser = (id) => db.query("select set_config('test.user',$1,false)", [id])
  await asUser(staff)
  const group = (await db.query('select public.community_save_group(null,$1,$2,null,$3,0) id', ['Group', north, [leader]])).rows[0].id
  const revision = (await db.query('select revision from community_groups where id=$1', [group])).rows[0].revision
  await asUser(outsider)
  assert.equal((await db.query('select public.can_access_community_group($1) allowed', [group])).rows[0].allowed, false)
  await assert.rejects(db.query('select public.community_manage_group_leaders($1,$2,$3)', [group, [crossCampus], revision]), /not available/)
  await asUser(staff)
  await db.query('select public.community_manage_group_leaders($1,$2,$3)', [group, [leader, crossCampus], revision])
  await asUser(leader)
  await assert.rejects(db.query('select public.community_manage_group_leaders($1,$2,$3)', [group, [leader], revision + 1]), /Staff or admin/)
  await asUser(staff)
  const nextRevision = revision + 1
  await db.query('select public.community_save_group($1,$2,$3,null,$4,$5)', [group, 'Renamed Group', north, [leader, crossCampus], nextRevision])
  await assert.rejects(db.query('select public.community_manage_group_leaders($1,$2,$3)', [group, [leader], revision]), /changed/)
  await assert.rejects(db.query('select public.community_manage_group_leaders($1,$2,$3)', [group, [], nextRevision + 1]), /at least one/)
  await asUser(crossCampus)
  assert.equal((await db.query('select public.can_access_community_group($1) allowed', [group])).rows[0].allowed, true)
  await asUser(outsider)
  assert.equal((await db.query('select public.can_access_community_group($1) allowed', [group])).rows[0].allowed, false)
  assert.equal((await db.query('select count(*)::int n from community_group_leaders where group_id=$1', [group])).rows[0].n, 2)
})
