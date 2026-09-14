import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migration = async (db, name) => db.exec(await readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8'))
async function setup(t) {
  const db = new PGlite(); t.after(() => db.close())
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
  await migration(db, '20260911_community_groups_foundation')
  const ids = Object.fromEntries(['campaign','oldCampaign','north','south','admin','staff','leader','otherLeader','outsider','student','duplicate','former','never'].map(k => [k, randomUUID()]))
  const { campaign, oldCampaign, north, south, admin, staff, leader, otherLeader, outsider, student, duplicate, former, never } = ids
  for (const [id, status] of [[campaign,'active'],[oldCampaign,'archived']]) await db.query('insert into follow_up_campaigns values($1,$2,current_date-90,current_date+200)', [id,status])
  for (const id of [north,south]) await db.query('insert into ministry_areas(id) values($1)', [id])
  for (const [id,role,area] of [[admin,'admin',north],[staff,'staff',north],[leader,'student_leader',north],[otherLeader,'discipler',north],[outsider,'staff',south]]) {
    await db.query('insert into profiles(id,role) values($1,$2)',[id,role])
    await db.query('insert into profile_ministry_area_assignments values($1,$2,$3,true)',[id,campaign,area])
  }
  for (const id of [student,duplicate,former,never]) await db.query('insert into students(id) values($1)',[id])
  const asUser = id => db.query("select set_config('test.user',$1,false)",[id])
  const rpc = async (name,args) => (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result
  const today=(await db.query("select (now() at time zone 'America/Detroit')::date::text d")).rows[0].d
  await asUser(admin)
  ids.group=await rpc('community_save_group',[null,'First group',north,'Monday',[leader],0])
  ids.second=await rpc('community_save_group',[null,'Second group',north,'Tuesday',[otherLeader],0])
  for (const s of [student,duplicate,former,never]) await rpc('community_add_member',[ids.group,s,today])
  await rpc('community_add_member',[ids.second,student,today])
  await db.query('update community_group_memberships set ended_on=$1 where student_id=$2',[today,former])
  return { db, ids, asUser, rpc, today }
}

test('campaign events: permissions, shared responses, stale edits, archives and merge preservation', async t => {
  const { db, ids, asUser, rpc, today } = await setup(t)
  const { campaign, oldCampaign, north, south, admin, staff, leader, otherLeader, outsider, student, duplicate, former, group, second } = ids
  await migration(db,'20260914_community_events')
  const saveEvent=(id=null,rev=0,open=true,c=campaign) => rpc('community_save_event',[c,id,'Fall gathering',today,'Campus','Dinner and conversation',open,rev])
  await asUser(leader)
  await assert.rejects(saveEvent(),/Staff or admin/)
  await asUser(staff)
  const event=await saveEvent()
  await assert.rejects(saveEvent(event,0),/changed/)
  await assert.rejects(saveEvent(null,0,true,oldCampaign),/read-only/)
  await assert.rejects(rpc('community_save_event',[campaign,null,' ',today,'','',true,0]),/Check the event/)
  await assert.rejects(rpc('community_save_event',[campaign,null,'Event','1900-01-01','','',true,0]),/academic year/)
  const set=(g,s,status,version) => rpc('community_set_invitation',[g,event,s,status,version])
  await asUser(leader)
  await db.exec('set role authenticated')
  assert.equal((await db.query('select * from community_events')).rows.length,1)
  await assert.rejects(db.query("insert into community_event_invitations(event_id,student_id,status) values($1,$2,'coming')",[event,student]),/permission denied/)
  assert.equal(await set(group,student,'invited',0),1)
  await assert.rejects(set(group,student,'coming',0),/changed/)
  await assert.rejects(set(group,former,'invited',0),/no longer/)
  await assert.rejects(set(group,student,'invalid',1),/valid invitation/)
  await assert.rejects(set(second,student,'coming',1),/not available/)
  await db.exec('reset role')
  await asUser(otherLeader)
  await db.exec('set role authenticated')
  assert.equal((await db.query('select status from community_event_invitations where student_id=$1',[student])).rows[0].status,'invited')
  assert.equal(await set(second,student,'coming',1),2)
  await db.exec('reset role')
  await asUser(outsider)
  await db.exec('set role authenticated')
  assert.equal((await db.query('select * from community_event_invitations')).rows.length,0)
  await assert.rejects(set(group,student,'maybe',2),/not available/)
  await db.exec('reset role')
  await asUser(leader)
  await db.query('update profile_ministry_area_assignments set ministry_area_id=$1 where profile_id=$2',[south,leader])
  await assert.rejects(set(group,student,'maybe',2),/not available/)
  await db.query('update profile_ministry_area_assignments set ministry_area_id=$1 where profile_id=$2',[north,leader])
  await db.query('update profiles set is_active=false where id=$1',[leader])
  await assert.rejects(set(group,student,'maybe',2),/not available/)
  await db.query('update profiles set is_active=true where id=$1',[leader])
  await db.query('delete from community_group_leaders where group_id=$1 and profile_id=$2',[group,leader])
  await assert.rejects(set(group,student,'maybe',2),/not available/)
  await db.query('insert into community_group_leaders(group_id,profile_id) values($1,$2)',[group,leader])
  await asUser(admin)
  await saveEvent(event,1,false)
  await assert.rejects(set(group,student,'maybe',2),/closed/)
  await saveEvent(event,2,true)
  await db.query("update follow_up_campaigns set status='archived' where id=$1",[campaign])
  await assert.rejects(set(group,student,'maybe',2),/read-only/)
  await assert.rejects(saveEvent(event,3),/read-only/)
  await db.query("update follow_up_campaigns set status='active' where id=$1",[campaign])
  const otherEvent=(await db.query("insert into community_events(campaign_id,name,event_date) values($1,'Old', $2) returning id",[oldCampaign,today])).rows[0].id
  await assert.rejects(rpc('community_set_invitation',[group,otherEvent,student,'maybe',0]),/not available for this campaign/)
  await db.exec('set role anon')
  await assert.rejects(set(group,student,'maybe',2),/permission denied/)
  await db.exec('reset role')
  await set(group,duplicate,'maybe',0)
  await db.query("update community_event_invitations set updated_at=now()+interval '1 minute' where student_id=$1",[duplicate])
  await db.query('insert into follow_up_contact_merge_log(kept_student_id,merged_student_id) values($1,$2)',[student,duplicate])
  const merged=(await db.query('select * from community_event_invitations where event_id=$1',[event])).rows
  assert.equal(merged.length,1)
  assert.equal(merged[0].student_id,student)
  assert.equal(merged[0].status,'maybe','most recently edited duplicate response survives')
  assert.ok(merged[0].version>2)
  await assert.rejects(set(group,student,'coming',2),/changed/)
  assert.equal((await db.query('select status from follow_up_contacts where student_id=$1',[student])).rows[0].status,'uncontacted')
  await db.query('delete from follow_up_contacts where student_id=$1',[duplicate])
  await db.query('delete from students where id=$1',[duplicate])
  await db.query('delete from follow_up_campaigns where id=$1',[campaign])
  assert.equal((await db.query('select * from community_event_invitations')).rows.length,0)
})

test('Ever attended split: scoped SQL partitions active/former and preserves the original query', async t => {
  const { db, ids, asUser, today } = await setup(t)
  const { campaign, student, former, never, group, outsider, leader } = ids
  // A deliberately minimal source query with the production migration markers.
  // This tests scope predicates; it is not a substitute for the full exported-schema parity suite.
  await db.exec(`create function public.get_follow_up_contact_results_v2(p_view text,p_spreadsheet_status text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_campaign_id uuid; v_view text:=p_view; result jsonb;
begin
  select id into v_campaign_id from public.follow_up_campaigns where status='active';
  with base as (
    select c.* from public.follow_up_contacts c where c.campaign_id = v_campaign_id
  ) select jsonb_build_object('total_count',count(*),'ids',coalesce(jsonb_agg(student_id order by student_id),'[]'::jsonb)) into result from base;
  return result;
end; $$;`)
  await migration(db,'20260912_community_contact_results')
  const original=(await db.query("select pg_get_functiondef(oid) def from pg_proc where proname='get_follow_up_contact_results_v2'")).rows[0].def
  await migration(db,'20260914_community_attendance_filters')
  await migration(db,'20260914_community_attendance_filters')
  assert.equal((await db.query("select pg_get_functiondef(oid) def from pg_proc where proname='get_follow_up_contact_results_v2'")).rows[0].def,original)
  const meeting=(await db.query('insert into community_group_meetings(group_id,meeting_date) values($1,$2) returning id',[group,today])).rows[0].id
  for (const s of [student,former]) await db.query('insert into community_group_attendance values($1,$2,true,now())',[meeting,s])
  await db.query('insert into community_group_attendance values($1,$2,false,now())',[meeting,never])
  const scope=async segment => (await db.query("select get_community_contact_results($1,$2,'area') r",[group,segment])).rows[0].r
  assert.equal((await scope('ever')).total_count,2)
  assert.deepEqual((await scope('ever_attending')).ids,[student])
  assert.deepEqual((await scope('ever_former')).ids,[former])
  await db.query('update community_group_memberships set ended_on=null where group_id=$1 and student_id=$2',[group,former])
  assert.equal((await scope('ever_attending')).total_count,2)
  assert.equal((await scope('ever_former')).total_count,0)
  await asUser(outsider)
  await assert.rejects(scope('ever_former'),/not available/)
  await asUser(leader)
  assert.equal((await scope('ever_attending')).total_count,2)
  await db.query("update follow_up_campaigns set status='archived' where id=$1",[campaign])
  await assert.rejects(scope('ever_attending'),/active campaign/)
})
