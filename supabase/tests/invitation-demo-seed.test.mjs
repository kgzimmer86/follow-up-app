import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('demo seed requires test campaign, inserts known combinations, and never overwrites a repeat', async t => {
  const db = new PGlite(); t.after(() => db.close())
  const read = path => readFile(new URL(path, import.meta.url), 'utf8')
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;`)
  await db.exec(await read('./fixtures/exported-core-schema.sql'))
  await db.exec('create table follow_up_contact_merge_log(id uuid primary key,kept_student_id uuid,merged_student_id uuid)')
  await db.exec(await read('../migrations/20260911_community_groups_foundation.sql'))
  const seed = await read('./seed-invitation-demo-contacts.sql')
  await assert.rejects(db.exec(seed), /expected TEST campaign/)
  await db.exec('rollback')
  assert.equal((await db.query('select count(*)::int n from students')).rows[0].n,0)
  await db.exec(`insert into follow_up_campaigns(id,academic_year,label,status,starts_on,ends_on)
    values('290aaf10-2d90-4b60-8768-723e6470baf4','TEST','TEST ONLY','active',current_date-90,current_date+90);
    insert into ministry_areas(name,slug,area_type) values('Bursley','bursley','dorm'),('Markley','markley','dorm');
    insert into community_groups(campaign_id,ministry_area_id,name)
    select '290aaf10-2d90-4b60-8768-723e6470baf4',id,'TEST North Tuesday' from ministry_areas where name='Bursley';`)
  await db.exec(seed)
  assert.equal((await db.query('select count(*)::int n from students')).rows[0].n,12)
  assert.equal((await db.query('select count(*)::int n from community_group_memberships where ended_on is null')).rows[0].n,4)
  const matches = await db.query(`select s.display_name from students s join follow_up_contacts c on c.student_id=s.id
    join ministry_areas a on a.id=c.ministry_location_id where a.name='Bursley' and c.gender_raw='Male'
    and c.community_interest in ('yes','maybe') order by s.display_name`)
  assert.deepEqual(matches.rows.map(r=>r.display_name),['INVITE TEST 01 Alex','INVITE TEST 02 Ben','INVITE TEST 05 Ethan','INVITE TEST 06 Finn'])
  const roster = await db.query(`select s.display_name from students s join follow_up_contacts c on c.student_id=s.id
    join ministry_areas a on a.id=c.ministry_location_id where a.name='Bursley' and c.gender_raw='Male'
    and c.community_interest in ('yes','maybe') and exists(select 1 from community_group_memberships m where m.student_id=s.id and m.ended_on is null) order by s.display_name`)
  assert.deepEqual(roster.rows.map(r=>r.display_name),['INVITE TEST 01 Alex','INVITE TEST 02 Ben'])
  await db.exec("update follow_up_contacts set status='involved' where student_id='d3140001-0000-4000-8000-000000000001'")
  await assert.rejects(db.exec(seed), /already exist/)
  await db.exec('rollback')
  assert.equal((await db.query("select status from follow_up_contacts where student_id='d3140001-0000-4000-8000-000000000001'")).rows[0].status,'involved')
  assert.equal((await db.query('select count(*)::int n from students')).rows[0].n,12)
})
