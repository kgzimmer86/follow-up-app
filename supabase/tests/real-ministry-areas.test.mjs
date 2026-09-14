import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
const read = p => readFile(new URL(p,import.meta.url),'utf8')
test('real test areas retain existing references, match supplied catalog, support seed, and rerun safely', async t => {
  const db = new PGlite(); t.after(()=>db.close())
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema private;
    create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as $$select null::uuid$$;`)
  await db.exec(await read('./fixtures/exported-core-schema.sql'))
  await db.exec('create table follow_up_contact_merge_log(id uuid primary key,kept_student_id uuid,merged_student_id uuid)')
  await db.exec(await read('../migrations/20260911_community_groups_foundation.sql'))
  const sql = await read('./sync-real-ministry-areas.sql')
  await assert.rejects(db.exec(sql),/Expected TEST campaign/); await db.exec('rollback')
  await db.exec(`insert into follow_up_campaigns(id,academic_year,label,status,starts_on,ends_on)
    values('290aaf10-2d90-4b60-8768-723e6470baf4','TEST','TEST ONLY','active',current_date-90,current_date+90);
    insert into ministry_areas(id,slug,name,area_type) values
    ('6d725d4c-4bdb-4ba9-b8bc-68280da6b993','test-north','TEST North','campus_region'),
    ('81cf5da1-20f0-4dae-8e85-1375c23c2e2d','test-central','TEST Central','campus_region');
    insert into ministry_areas(id,slug,name,area_type,parent_id) values
    ('30f1aae6-e829-4a2e-849e-ce22ebf8a6ea','bursley','Bursley','dorm','6d725d4c-4bdb-4ba9-b8bc-68280da6b993'),
    ('1638c4d9-c05c-4ca5-8376-9cb831d5606b','test-central-dorm','TEST Central Dorm','dorm','81cf5da1-20f0-4dae-8e85-1375c23c2e2d');
    insert into community_groups(campaign_id,ministry_area_id,name) values
    ('290aaf10-2d90-4b60-8768-723e6470baf4','30f1aae6-e829-4a2e-849e-ce22ebf8a6ea','TEST North Tuesday');
    insert into students(display_name) values('Existing invented student');
    insert into follow_up_contacts(campaign_id,student_id,ministry_location_id)
    select '290aaf10-2d90-4b60-8768-723e6470baf4',id,'1638c4d9-c05c-4ca5-8376-9cb831d5606b' from students;`)
  const before=(await db.query('select * from follow_up_contacts')).rows
  await db.exec(sql)
  const catalog=JSON.parse(await read('./fixtures/ministry-areas-reference.json')).sort((a,b)=>a.slug.localeCompare(b.slug))
  const snapshot=async()=>(await db.query(`select a.slug,a.name,a.area_type,p.slug parent_slug,a.sort_order from ministry_areas a left join ministry_areas p on p.id=a.parent_id order by a.slug`)).rows
  assert.deepEqual(await snapshot(),catalog)
  assert.deepEqual((await db.query('select * from follow_up_contacts')).rows,before)
  assert.equal((await db.query("select name from ministry_areas where id='1638c4d9-c05c-4ca5-8376-9cb831d5606b'")).rows[0].name,'West Quad')
  const idsBefore=(await db.query('select id from ministry_areas order by id')).rows
  await db.exec(sql)
  assert.deepEqual((await db.query('select id from ministry_areas order by id')).rows,idsBefore)
  await db.exec(await read('./seed-invitation-demo-contacts.sql'))
  assert.equal((await db.query("select count(*)::int n from students where display_name like 'INVITE TEST %'")).rows[0].n,12)
  assert.equal((await db.query('select count(*)::int n from community_group_memberships where ended_on is null')).rows[0].n,4)
})
