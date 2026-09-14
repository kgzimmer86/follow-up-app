// Real exported public RPCs, reconstructed exported core columns/constraints,
// and invented records only. Unexported normalization/progress helpers are explicit
// test doubles below. This is a compatibility test, not a full production clone.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const { PGlite } = await import(process.env.FOLLOW_UP_PGLITE_MODULE || '@electric-sql/pglite')
const fixture = name => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const admin=id(1), campaign=id(2), north=id(3), dorm=id(4), affinity=id(5)
async function setup(t, community) {
  const db=new PGlite(); t.after(()=>db.close())
  await db.exec(`create role authenticated; create role anon; create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;`)
  await db.exec(await fixture('exported-core-schema.sql'))
  await db.exec(`
    alter table survey_imports add column imported_at timestamptz;
    alter table survey_imports add primary key(id);
    alter table survey_import_rows add primary key(id);
    alter table survey_import_rows add foreign key(follow_up_contact_id) references follow_up_contacts(id);
    create table follow_up_events(id uuid primary key default gen_random_uuid(),contact_id uuid references follow_up_contacts(id),event_type text,occurred_at timestamptz,notes text);
    create table follow_up_status_history(id uuid primary key default gen_random_uuid(),contact_id uuid references follow_up_contacts(id));
    create table follow_up_assignment_history(id uuid primary key default gen_random_uuid(),contact_id uuid references follow_up_contacts(id));
    create table follow_up_contact_affinities(contact_id uuid references follow_up_contacts(id),ministry_area_id uuid references ministry_areas(id),created_at timestamptz default now(),primary key(contact_id,ministry_area_id));
    create table follow_up_contact_merge_log(id uuid primary key default gen_random_uuid(),campaign_id uuid,kept_contact_id uuid,merged_contact_id uuid,kept_student_id uuid,merged_student_id uuid,preferred_data_contact_id uuid,match_basis text,merged_by uuid,kept_contact_before jsonb,merged_contact_before jsonb,kept_student_before jsonb,merged_student_before jsonb,moved_counts jsonb);
    -- Missing private helper definitions: inputs below use canonical ASCII identity
    -- and exact names. Do not interpret these doubles as fuzzy-match coverage.
    create function private.follow_up_normalize_phone(v text) returns text language sql immutable as $$select nullif(right(regexp_replace(v,'[^0-9]','','g'),10),'')$$;
    create function private.follow_up_normalize_uniqname(v text) returns text language sql immutable as $$select nullif(split_part(lower(btrim(v)),'@',1),'')$$;
    create function private.follow_up_normalize_match_text(v text) returns text language sql immutable as $$select nullif(lower(btrim(v)),'')$$;
    create function private.follow_up_names_weakly_compatible(a text,b text) returns boolean language sql immutable as $$select lower(btrim(a))=lower(btrim(b))$$;
    create table progress_calls(contact_id uuid);
    create function private.recalculate_follow_up_contact_progress(v uuid) returns void language sql as $$insert into public.progress_calls values(v)$$;
  `)
  await db.exec(await fixture('exported-contact-functions.sql'))
  await db.exec(await fixture('exported-import-functions.sql'))
  await db.query('insert into auth.users values($1)',[admin])
  await db.query("insert into profiles(id,role,display_name) values($1,'admin','Invented Admin')",[admin])
  await db.query("select set_config('test.user',$1,false)",[admin])
  await db.query("insert into follow_up_campaigns(id,academic_year,label,starts_on,ends_on,status) values($1,'2026-test','Invented year',current_date-90,current_date+200,'active')",[campaign])
  await db.query("insert into ministry_areas(id,name,slug,area_type) values($1,'Invented North','test-north','campus_region'),($2,'Invented Affinity','test-affinity','affinity')",[north,affinity])
  await db.query("insert into ministry_areas(id,name,slug,area_type,parent_id) values($1,'Invented Dorm','test-dorm','dorm',$2)",[dorm,north])
  if(community) {
    await db.exec(await readFile(new URL('../migrations/20260911_community_groups_foundation.sql',import.meta.url),'utf8'))
    await db.exec(await readFile(new URL('../migrations/20260914_community_events.sql',import.meta.url),'utf8'))
  }
  const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result
  return {db,rpc}
}
async function contact(db,n,{origin='field_added',uniqname=null}={}) {
  await db.query("insert into students(id,display_name,uniqname,phone) values($1,'Invented Alex',$2,'2025550101')",[id(n),uniqname])
  await db.query("insert into follow_up_contacts(id,campaign_id,student_id,contact_origin,ministry_location_id,room_or_address,phone,status,primary_owner_id,knock_count,cg_text_invite_only) values($1,$2,$3,$4,$5,'101','2025550101','go_back',$6,3,true)",[id(n+1000),campaign,id(n),origin,dorm,admin])
  return id(n+1000)
}
const snap=async(db,c)=>(await db.query('select * from follow_up_contacts where id=$1',[c])).rows[0]
function stable(c) { return Object.fromEntries(Object.entries(c).filter(([key]) => !['created_at','updated_at'].includes(key))) }
async function group(rpc,name='Invented Group') { return rpc('community_save_group',[null,name,dorm,'Tuesday',[admin],0]) }

for(const enabled of [false,true]) {
 test(`exported importer and Add Person preserve Follow Up (Community ${enabled?'installed':'absent'})`,async t=>{
  const {db,rpc}=await setup(t,enabled)
  const result=await rpc('create_field_added_contact_v2',['Invented Alex','2025550101','inventedalex',null,dorm,'101',null,'Male'])
  const c=result.contact_id
  const again=await rpc('create_field_added_contact_v2',['Invented Alex','2025550101','inventedalex',null,dorm,'101',null,'Male'])
  assert.equal(again.contact_id,c); assert.equal(again.created,false)
  await rpc('set_follow_up_contact_status',[c,'involved'])
  await db.query('update follow_up_contacts set primary_owner_id=$2,knock_count=3,cg_text_invite_only=true,house_name=\'Retained house\' where id=$1',[c,admin])
  await db.query("insert into follow_up_events(contact_id,event_type,occurred_at,notes) values($1,'interaction','2026-09-01','Preserve this history')",[c])
  if(enabled) {
    const g=await group(rpc)
    const today=(await db.query("select (now() at time zone 'America/Detroit')::date::text d")).rows[0].d
    await rpc('community_add_member',[g,result.student_id,today])
    await rpc('save_community_group_attendance',[g,today,[result.student_id],[result.student_id],0,2])
  }
  const before=await snap(db,c)
  const row={row_number:2,name:'Invented Alex',uniqname:'inventedalex',phone:'2025550101',community_interest:'no',house_name:null,affinities:[],issues:[],raw_data:{}}
  const skipped=await rpc('import_survey_rows_v2',[campaign,'invented.csv',[],[{...row,action:'skip'}]])
  assert.equal(skipped.skipped_rows,1)
  assert.deepEqual(await snap(db,c),before,'Keep current must leave every field unchanged')
  const refreshed=await rpc('import_survey_rows_v2',[campaign,'invented.csv',[],[{...row,action:'update_existing',affinities_supplied:true}]])
  assert.equal(refreshed.contacts_updated,1)
  const after=await snap(db,c)
  for(const field of ['status','primary_owner_id','knock_count','cg_text_invite_only','house_name']) assert.deepEqual(after[field],before[field],field)
  assert.equal(after.community_interest,'no')
  assert.equal((await db.query('select notes from follow_up_events where contact_id=$1',[c])).rows[0].notes,'Preserve this history')
  const importsBefore=(await db.query('select count(*)::int n from survey_imports')).rows[0].n
  await assert.rejects(rpc('import_survey_rows_v2',[campaign,'invalid.csv',[],[{...row,action:'update_existing',community_interest:'yes'},{...row,row_number:3,action:'invalid'}]]),/unsupported action/)
  assert.deepEqual(await snap(db,c),after,'failed import rolls back earlier rows')
  assert.equal((await db.query('select count(*)::int n from survey_imports')).rows[0].n,importsBefore)
  if(enabled) assert.equal((await db.query('select count(*)::int n from community_group_attendance where is_present')).rows[0].n,1)
 })
}

test('actual merge transfers all existing relationships and Community records before deleting the duplicate',async t=>{
 const {db,rpc}=await setup(t,true)
 const keep=await contact(db,10), source=await contact(db,11,{origin:'survey',uniqname:'inventedalex'})
 await db.query("update follow_up_contacts set community_interest='yes' where id=$1",[source])
 for(const table of ['follow_up_events','follow_up_status_history','follow_up_assignment_history']) await db.query(`insert into ${table}(contact_id) values($1)`,[source])
 await db.query('insert into follow_up_contact_affinities(contact_id,ministry_area_id) values($1,$2)',[source,affinity])
 await db.query("insert into survey_import_rows(import_id,row_number,raw_data,follow_up_contact_id) values($1,2,'{}',$2)",[id(99),source])
 const g=await group(rpc)
 const today=(await db.query("select (now() at time zone 'America/Detroit')::date::text d")).rows[0].d
 await rpc('community_add_member',[g,id(10),today]); await rpc('community_add_member',[g,id(11),today])
 await rpc('save_community_group_attendance',[g,today,[id(11)],[id(10),id(11)],0,3])
 const event=await rpc('community_save_event',[campaign,null,'Invented event',today,'','',true,0])
 await rpc('community_set_invitation',[g,event,id(11),'coming',0])
 const merged=await rpc('merge_follow_up_contacts',[keep,source,source,'reviewed'])
 assert.equal(merged.merged,true)
 assert.equal((await db.query('select count(*)::int n from students where id=$1',[id(11)])).rows[0].n,0)
 for(const table of ['follow_up_events','follow_up_status_history','follow_up_assignment_history','follow_up_contact_affinities']) assert.equal((await db.query(`select count(*)::int n from ${table} where contact_id=$1`,[keep])).rows[0].n,1,table)
 assert.equal((await db.query('select follow_up_contact_id from survey_import_rows')).rows[0].follow_up_contact_id,keep)
 const survivor=await snap(db,keep)
 assert.equal(survivor.status,'go_back'); assert.equal(survivor.primary_owner_id,admin); assert.equal(survivor.community_interest,'yes')
 assert.equal((await db.query('select count(*)::int n from community_group_memberships where student_id=$1 and ended_on is null',[id(10)])).rows[0].n,1)
 assert.deepEqual((await db.query('select student_id,is_present from community_group_attendance')).rows,[{student_id:id(10),is_present:true}])
 assert.deepEqual((await db.query('select student_id,status from community_event_invitations')).rows,[{student_id:id(10),status:'coming'}])
})

test('actual importer weak-match merge preserves an existing Community member and their Follow Up identity',async t=>{
 const {db,rpc}=await setup(t,true)
 const keep=await contact(db,20)
 const g=await group(rpc)
 const today=(await db.query("select (now() at time zone 'America/Detroit')::date::text d")).rows[0].d
 await rpc('community_add_member',[g,id(20),today])
 const event=await rpc('community_save_event',[campaign,null,'Invented event',today,'','',true,0])
 await rpc('community_set_invitation',[g,event,id(20),'invited',0])
 const result=await rpc('import_survey_rows_v2',[campaign,'invented.csv',[],[{row_number:2,action:'merge_into_existing',merge_contact_id:keep,name:'Invented Alex',uniqname:'inventedalex',phone:'2025550101',location:'Invented Dorm',room_or_address:'101',community_interest:'yes',affinities:[]}]])
 assert.equal(result.contacts_merged,1)
 assert.equal((await snap(db,keep)).student_id,id(20))
 assert.equal((await snap(db,keep)).status,'go_back')
 assert.equal((await db.query('select student_id from community_group_memberships')).rows[0].student_id,id(20))
 assert.deepEqual((await db.query('select student_id,status from community_event_invitations')).rows,[{student_id:id(20),status:'invited'}])
})

test('failure in the Community merge hook rolls back the whole existing merge',async t=>{
 const {db,rpc}=await setup(t,true)
 const keep=await contact(db,30), source=await contact(db,31,{origin:'survey',uniqname:'inventedalex'})
 const beforeKeep=await snap(db,keep), beforeSource=await snap(db,source)
 const g=await group(rpc)
 const today=(await db.query("select (now() at time zone 'America/Detroit')::date::text d")).rows[0].d
 await rpc('community_add_member',[g,id(31),today])
 await db.exec(`create function private.inject_test_failure() returns trigger language plpgsql as $$begin raise exception 'Injected test failure'; end$$;
 create trigger inject_test_failure before update on community_group_memberships for each row execute function private.inject_test_failure();`)
 await assert.rejects(rpc('merge_follow_up_contacts',[keep,source,source,'reviewed']),/Injected test failure/)
 assert.deepEqual(stable(await snap(db,keep)),stable(beforeKeep)); assert.deepEqual(stable(await snap(db,source)),stable(beforeSource))
 assert.equal((await db.query('select uniqname from students where id=$1',[id(31)])).rows[0].uniqname,'inventedalex')
 assert.equal((await db.query('select count(*)::int n from follow_up_contact_merge_log')).rows[0].n,0)
})
