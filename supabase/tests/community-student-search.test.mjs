import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const { PGlite } = await import(process.env.FOLLOW_UP_PGLITE_MODULE || '@electric-sql/pglite')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const migration = name => readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')

test('Community search: leader areas, broader area, campus fallback and permissions', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role authenticated; create role anon; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table profiles(id uuid primary key,role text,is_active boolean default true);
    create table follow_up_campaigns(id uuid primary key,status text,starts_on date,ends_on date);
    create table ministry_areas(id uuid primary key,parent_id uuid,name text,area_type text,is_active boolean default true);
    create table profile_ministry_area_assignments(profile_id uuid,campaign_id uuid,ministry_area_id uuid,is_default boolean);
    create table students(id uuid primary key,display_name text,uniqname text,umich_email text,phone text,gender_raw text);
    create table follow_up_contacts(id uuid primary key default gen_random_uuid(),campaign_id uuid references follow_up_campaigns on delete cascade,student_id uuid references students,status text default 'uncontacted',phone text,gender_raw text,contact_origin text,field_added_by uuid,location_resolution text,ministry_location_id uuid,raw_location_text text,unique(campaign_id,student_id));
    create table follow_up_contact_affinities(contact_id uuid,ministry_area_id uuid);
    create table follow_up_contact_merge_log(id uuid primary key default gen_random_uuid(),kept_student_id uuid,merged_student_id uuid);
    create function set_follow_up_contact_status(p_contact_id uuid,p_status text) returns void language sql as $$update public.follow_up_contacts set status=p_status where id=p_contact_id$$;
  `)
  await db.exec(await migration('20260911_community_groups_foundation'))
  const sql = await migration('20260926_community_student_search')
  await db.exec(sql); await db.exec(sql) // Safe same-file rerun.
  const campaign=id(1), oldCampaign=id(2), staff=id(3), leader=id(4), coleader=id(5), outsider=id(6)
  const north=id(10), dorm=id(11), sibling=id(12), otherRegion=id(13), remote=id(14), affinity=id(15)
  for (const [area,parent,name,type] of [[north,null,'Invented North','campus_region'],[dorm,north,'Invented Cedar','dorm'],[sibling,north,'Invented Birch','dorm'],[otherRegion,null,'Invented South','campus_region'],[remote,otherRegion,'Invented Oak','dorm'],[affinity,null,'Invented Club','affinity']]) {
    await db.query('insert into ministry_areas values($1,$2,$3,$4,true)',[area,parent,name,type])
  }
  for (const c of [campaign,oldCampaign]) await db.query("insert into follow_up_campaigns values($1,'active',current_date-90,current_date+90)",[c])
  for (const [p,role] of [[staff,'admin'],[leader,'student_leader'],[coleader,'discipler'],[outsider,'student_leader']]) await db.query('insert into profiles values($1,$2,true)',[p,role])
  await db.query('insert into profile_ministry_area_assignments values($1,$3,$4,true),($2,$3,$5,true),($1,$3,$5,false),($1,$6,$5,true)',[leader,coleader,campaign,dorm,remote,oldCampaign])
  await db.query('insert into profile_ministry_area_assignments values($1,$2,$3,true)',[coleader,campaign,dorm])
  const asUser = p => db.query("select set_config('test.user',$1,false)",[p ?? ''])
  await asUser(staff)
  const group=(await db.query("select community_save_group(null,'Invented Group',$1,'Monday',$2::uuid[],0) id",[dorm,[leader,coleader]])).rows[0].id
  // Give the searching admin a different area: ordering must still use leaders.
  // Admin remains unrestricted for authorization (no default assignment).
  await db.query('insert into profile_ministry_area_assignments values($1,$2,$3,false)',[staff,campaign,sibling])
  async function person(n,name,area,{contact=true,year=campaign,raw=null}={}) {
    await db.query('insert into students(id,display_name,uniqname,umich_email) values($1,$2,$3,$4)',[id(n),name,`invented${n}`,`invented${n}@example.invalid`])
    if(contact) await db.query('insert into follow_up_contacts(id,campaign_id,student_id,ministry_location_id,raw_location_text) values($1,$2,$3,$4,$5)',[id(n+1000),year,id(n),area,raw])
  }
  await person(100,'Match Z Cedar',dorm)
  await person(101,'Match Y Oak',remote)
  await person(102,'Match B Birch',sibling)
  await person(103,'Match A Missing',null,{contact:false})
  await person(104,'Match C Old',dorm,{year:oldCampaign})
  await person(105,'Match D Raw',null,{raw:'Invented off-campus housing'})
  const search = async q => (await db.query('select * from community_search_students($1,$2)',[group,q])).rows
  const ids = rows => rows.map(p=>p.id)
  await db.exec('set role authenticated')
  let rows=await search('MATCH')
  assert.deepEqual(ids(rows),[101,100,102,103,104,105].map(id))
  assert.equal(rows[1].dorm,'Invented Cedar')
  assert.equal(rows[3].dorm,null)
  assert.equal(rows[4].dorm,null,'old campaign location is not displayed or ranked')
  assert.equal(rows[5].dorm,'Invented off-campus housing')
  assert.equal((await search('invented100@example.invalid'))[0].id,id(100))
  assert.equal((await search('invented102'))[0].id,id(102))
  assert.deepEqual(await search('%_'),[],'wildcards are literal')
  assert.deepEqual(await search('zz-no-match'),[])
  await assert.rejects(search(' '),/between 2 and 200/)
  await assert.rejects(search('x'.repeat(201)),/between 2 and 200/)
  await db.exec('reset role')
  await db.query('update profiles set is_active=false where id=$1',[coleader])
  assert.deepEqual(ids(await search('match')),[100,102,103,104,105,101].map(id),'inactive co-leader and old/non-default assignments do not boost Oak')
  await db.query('update profile_ministry_area_assignments set ministry_area_id=$1 where profile_id=$2 and campaign_id=$3 and is_default',[north,leader,campaign])
  assert.deepEqual(ids(await search('match')).slice(0,2),[102,100].map(id),'region assignment includes descendants')
  await db.query('update profile_ministry_area_assignments set ministry_area_id=$1 where profile_id=$2 and campaign_id=$3 and is_default',[affinity,leader,campaign])
  await db.query('insert into follow_up_contact_affinities values($1,$2)',[id(1105),affinity])
  assert.equal((await search('match'))[0].id,id(105),'affinity leader prioritizes affinity members')
  await db.query('update profile_ministry_area_assignments set ministry_area_id=$1 where profile_id=$2 and campaign_id=$3 and is_default',[dorm,leader,campaign])
  for(let n=200;n<235;n++) await person(n,`Match A Campus ${n}`,null)
  rows=await search('match')
  assert.equal(rows.length,30)
  assert.deepEqual(ids(rows).slice(0,2),[100,102].map(id),'ranking happens before limit')
  assert.equal(new Set(ids(rows)).size,30)
  await asUser(leader); assert.equal((await search('match'))[0].id,id(100))
  await asUser(outsider); await assert.rejects(search('match'),/not available/)
  await asUser(null); await assert.rejects(search('match'),/not available/)
  await asUser(leader)
  await db.query("update profiles set role='pending' where id=$1",[leader])
  await assert.rejects(search('match'),/not available/)
  await asUser(staff)
  await db.query('update community_groups set is_active=false where id=$1',[group])
  await assert.rejects(search('match'),/read-only/)
  await db.query('update community_groups set is_active=true where id=$1',[group])
  await db.query("update follow_up_campaigns set status='archived' where id=$1",[campaign])
  await assert.rejects(search('match'),/read-only/)
  assert.equal((await db.query("select has_function_privilege('anon','community_search_students(uuid,text)','execute') allowed")).rows[0].allowed,false)
  assert.equal((await db.query('select count(*)::int n from community_group_memberships')).rows[0].n,0,'search never adds roster members')
  assert.equal((await db.query("select count(*)::int n from follow_up_contacts where status <> 'uncontacted'")).rows[0].n,0,'search preserves contact state')
})

test('both Community entry points share dorm-aware search without changing add behavior', async () => {
  const source = await readFile(new URL('../../src/components/community/group-controls.tsx',import.meta.url),'utf8')
  assert.match(source,/rpc\('community_search_students'/)
  assert.match(source,/p\.dorm \|\| 'Dorm\/location not recorded'/)
  assert.match(source,/rpc\('community_add_member'/)
  for(const file of ['src/components/community/attendance-checklist.tsx','src/app/community/groups/[groupId]/page.tsx']) {
    assert.match(await readFile(new URL(`../../${file}`,import.meta.url),'utf8'),/<AddAttender groupId=/)
  }
})
