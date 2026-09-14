import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const { PGlite } = await import(process.env.FOLLOW_UP_PGLITE_MODULE || '@electric-sql/pglite')
const schemaPath = process.env.FOLLOW_UP_EXPORTED_SCHEMA
if (!schemaPath) throw new Error('Set FOLLOW_UP_EXPORTED_SCHEMA to the structure-only staging schema. Never supply a data dump.')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`

test('database-scoped contact results: scale, parity, permissions, filters and archives', async t => {
  const db = new PGlite(); t.after(() => db.close())
  // Only Supabase-managed infrastructure is simulated; application schema/functions
  // come from the local structure-only export, not a live database connection.
  await db.exec(`create role anon; create role authenticated; create role service_role; create role supabase_admin;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb,raw_app_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
    create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
    create table storage.objects(id uuid primary key,bucket_id text,name text,owner_id text);
    create table storage.buckets(id text primary key,name text,public boolean);
    create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
    select set_config('followup.staging_project','tcbwepqkvnquxkbtaxcl',false);`)
  await db.exec(await readFile(schemaPath,'utf8'))
  await db.exec(await readFile(new URL('../migrations/20260911_community_groups_foundation.sql',import.meta.url),'utf8'))
  const original = async () => (await db.query("select pg_get_functiondef(oid) def from pg_proc where proname='get_follow_up_contact_results_v2' and 'p_spreadsheet_status'=any(proargnames)")).rows[0].def
  const before = await original()
  const migration = await readFile(new URL('../migrations/20260912_community_contact_results.sql',import.meta.url),'utf8')
  await db.exec(migration)
  await db.exec(migration) // rerun-safe
  await db.exec(await readFile(new URL('../migrations/20260914_community_attendance_filters.sql',import.meta.url),'utf8'))
  assert.equal(await original(), before, 'normal Follow Up function stays byte-for-byte unchanged')
  const admin=id(1), leader=id(2), outsider=id(3), campaign=id(4), area=id(5), group=id(6), otherGroup=id(7)
  for (const [user,role] of [[admin,'admin'],[leader,'student_leader'],[outsider,'student_leader']]) {
    await db.query('insert into auth.users(id,email) values($1,$2)',[user,`${role}-${user}@example.invalid`])
    await db.query("insert into profiles(id,display_name,role) values($1,'Invented tester',$2) on conflict(id) do update set role=excluded.role",[user,role])
  }
  await db.query("insert into follow_up_campaigns(id,academic_year,label,status,starts_on,ends_on) values($1,'TEST','Invented test year','active',current_date-90,current_date+200)",[campaign])
  await db.query("insert into ministry_areas(id,name,slug,area_type) values($1,'Invented Dorm','test-dorm','dorm')",[area])
  for (const g of [group,otherGroup]) {
    await db.query("insert into community_groups(id,campaign_id,ministry_area_id,name) values($1,$2,$3,'Invented group')",[g,campaign,area])
    await db.query('insert into community_group_leaders(group_id,profile_id) values($1,$2)',[g,g===group?leader:outsider])
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin])
  await db.exec(`insert into students(id,display_name) select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Invented '||lpad(n::text,5,'0') from generate_series(1,10000) n;`)
  await db.query(`insert into follow_up_contacts(campaign_id,student_id,ministry_location_id,status,gender_raw)
    select $1,id,$2,case when display_name >= 'Invented 09901' then 'involved' else 'uncontacted' end,
      case when right(display_name,1) in ('0','2','4','6','8') then 'Male' else 'Female' end from students`,[campaign,area])
  await db.query(`insert into community_group_memberships(group_id,student_id,started_on)
    select $1,id,current_date-10 from students where display_name >= 'Invented 09876'`,[group])
  const old=id(8), latest=id(9)
  await db.query('insert into community_group_meetings(id,group_id,meeting_date,saved_by) values($1,$3,current_date-2,$4),($2,$3,current_date-1,$4)',[old,latest,group,admin])
  await db.query('insert into community_group_attendance(meeting_id,student_id,is_present) select $1,student_id,true from community_group_memberships where group_id=$2',[old,group])
  await db.query(`insert into community_group_attendance(meeting_id,student_id,is_present)
    select $1,m.student_id,s.display_name >= 'Invented 09951' from community_group_memberships m join students s on s.id=m.student_id where group_id=$2`,[latest,group])
  const rpc = async (segment, extras='') => (await db.query(`select get_community_contact_results($1,$2,'area'${extras}) result`,[group,segment])).rows[0].result
  const start=performance.now()
  const roster=await rpc('roster')
  t.diagnostic(`10,000 invented contacts, 125 group members: one scoped SQL call ${(performance.now()-start).toFixed(1)} ms in local PGlite; not hosted latency.`)
  assert.equal(roster.total_count,125); assert.equal(roster.rows.length,50)
  const second=await rpc('roster',',p_page=>2'), third=await rpc('roster',',p_page=>3')
  assert.equal(second.rows.length,50); assert.equal(third.rows.length,25)
  assert.equal(new Set([...roster.rows,...second.rows,...third.rows].map(r=>r.id)).size,125)
  assert.equal((await rpc('involved')).total_count,100)
  assert.equal((await rpc('attended')).total_count,50)
  assert.equal((await rpc('ever')).total_count,125)
  assert.equal((await rpc('roster',",p_gender=>'male'")).total_count,63)
  assert.equal((await rpc('roster',",p_spreadsheet_status=>'involved'")).total_count,100)
  assert.equal((await rpc('roster',",p_dir=>'desc'")).rows[0].display_name,'Invented 10000')
  const ordinary=(await db.query("select get_follow_up_contact_results_v2('area',p_page=>200) result")).rows[0].result
  assert.deepEqual(third.rows,ordinary.rows.slice(-25),'existing card fields preserved exactly')
  await db.query("update community_group_memberships set ended_on=current_date where group_id=$1 and student_id=(select id from students where display_name='Invented 10000')",[group])
  assert.equal((await rpc('roster')).total_count,124)
  assert.equal((await rpc('ever')).total_count,125,'former members remain in lifetime attendance')
  assert.equal((await rpc('ever_attending')).total_count,124)
  assert.equal((await rpc('ever_former')).total_count,1)
  await db.exec('set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[leader])
  assert.equal((await rpc('roster')).total_count,124)
  await assert.rejects(db.query("select get_community_contact_results($1,'ever','area')",[otherGroup]),/not available/)
  await assert.rejects(rpc('invalid'),/Invalid Community/)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[outsider])
  await assert.rejects(rpc('roster'),/not available/)
  await db.exec('reset role')
  await db.query("update profiles set is_active=false where id=$1",[leader])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[leader])
  await assert.rejects(rpc('roster'),/Active Follow Up access/)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin])
  await db.query("update follow_up_campaigns set status='archived' where id=$1",[campaign])
  await assert.rejects(rpc('roster'),/No active/)
  await db.exec('set role anon')
  await assert.rejects(rpc('roster'),/permission denied/)
})
