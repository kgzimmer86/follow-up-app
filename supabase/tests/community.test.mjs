import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const { PGlite } = await import(process.env.FOLLOW_UP_PGLITE_MODULE || '@electric-sql/pglite')

test('Community permissions, attendance, membership, merge and campaign boundaries', async (t) => {
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
  const sql = await readFile(new URL('../migrations/20260911_community_groups_foundation.sql', import.meta.url), 'utf8')
  await db.exec(sql)
  await db.exec(await readFile(new URL('../migrations/20260913_community_delete_meeting.sql', import.meta.url), 'utf8'))
  const campaign=randomUUID(), north=randomUUID(), dorm=randomUUID(), central=randomUUID()
  const admin=randomUUID(), staff=randomUUID(), leader=randomUUID(), discipler=randomUUID(), outsider=randomUUID(), student=randomUUID(), duplicate=randomUUID()
  await db.query("insert into follow_up_campaigns values($1,'active',current_date-90,current_date+200)",[campaign])
  for(const [id,parent] of [[north,null],[dorm,north],[central,null]]) await db.query('insert into ministry_areas(id,parent_id) values($1,$2)',[id,parent])
  for(const [id,role] of [[admin,'admin'],[staff,'staff'],[leader,'student_leader'],[discipler,'discipler'],[outsider,'admin']]) await db.query('insert into profiles(id,role) values($1,$2)',[id,role])
  for(const [id,area,defaultFlag] of [[staff,north,true],[leader,north,true],[discipler,dorm,true],[outsider,central,true],[outsider,north,false]]) await db.query('insert into profile_ministry_area_assignments values($1,$2,$3,$4)',[id,campaign,area,defaultFlag])
  for(const id of [student,duplicate]) await db.query('insert into students(id) values($1)',[id])
  const asUser = id => db.query("select set_config('test.user',$1,false)",[id])
  const rpc = async (name,args) => (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result
  const today=(await db.query("select (now() at time zone 'America/Detroit')::date::text d")).rows[0].d
  await asUser(admin)
  const group=await rpc('community_save_group',[null,'Tuesday Group',dorm,'Tuesday',[leader,discipler],0])
  const second=await rpc('community_save_group',[null,'Thursday Group',dorm,'Thursday',[leader],0])
  await asUser(outsider)
  assert.equal(await rpc('can_access_community_group',[group]),false,'old non-default area cannot grant admin access')
  await assert.rejects(rpc('community_add_member',[group,student,today]),/not available/)
  await db.exec('set role authenticated')
  assert.equal((await db.query('select * from community_groups')).rows.length,0)
  await assert.rejects(db.query('insert into community_group_leaders(group_id,profile_id) values($1,$2)',[group,outsider]),/permission denied/)
  await db.exec('reset role')
  await asUser(staff); assert.equal(await rpc('can_access_community_group',[group]),true)
  await asUser(discipler); assert.equal(await rpc('can_access_community_group',[group]),true)
  assert.equal(await rpc('can_access_community_group',[second]),false)
  await asUser(leader)
  await db.query('update profiles set is_active=false where id=$1',[leader])
  assert.equal(await rpc('can_access_community_group',[group]),false)
  await db.query("update profiles set is_active=true,role='pending' where id=$1",[leader])
  assert.equal(await rpc('can_access_community_group',[group]),false)
  await db.query("update profiles set role='student_leader' where id=$1",[leader])
  await assert.rejects(rpc('community_save_group',[null,'No',dorm,'Tuesday',[leader],0]),/Staff or admin/)
  const contact=await rpc('community_add_member',[group,student,today])
  assert.equal(await rpc('community_add_member',[second,student,today]),contact)
  let revision=(await db.query('select revision from community_groups where id=$1',[group])).rows[0].revision
  const meeting=await rpc('save_community_group_attendance',[group,today,[student],[student],0,revision])
  await db.exec('set role authenticated')
  assert.equal((await db.query('select * from community_groups')).rows.length,2,'assigned leader can read their groups through RLS')
  await db.exec('reset role')
  assert.equal((await db.query('select status from follow_up_contacts where id=$1',[contact])).rows[0].status,'uncontacted','attendance does not promote status')
  await assert.rejects(rpc('save_community_group_attendance',[group,today,[],[student],0,revision]),/changed/)
  await rpc('save_community_group_attendance',[group,today,[],[student],1,revision])
  assert.equal((await db.query('select is_present from community_group_attendance where meeting_id=$1',[meeting])).rows[0].is_present,false)
  await assert.rejects(rpc('save_community_group_attendance',[group,today,[duplicate],[student],2,revision]),/not on this roster/)
  await rpc('community_member_action',[group,student,'involved',null])
  assert.equal((await rpc('community_member_action',[group,student,'end',null])).needs_review,false)
  assert.equal((await rpc('community_member_action',[second,student,'end',null])).needs_review,true)
  assert.equal((await db.query('select ended_on from community_group_memberships where group_id=$1',[second])).rows[0].ended_on,null,'prompt is non-mutating')
  await rpc('community_member_action',[second,student,'end','go_back'])
  assert.equal((await db.query('select status from follow_up_contacts where id=$1',[contact])).rows[0].status,'go_back')
  // Simulate an earlier ended membership, then a return today.
  await db.query('update community_group_memberships set started_on=current_date-5,ended_on=current_date-2 where student_id=$1',[student])
  await rpc('community_add_member',[group,student,today])
  assert.equal((await db.query('select count(*)::int n from community_group_memberships where group_id=$1',[group])).rows[0].n,2)
  await rpc('community_add_member',[group,duplicate,today])
  await db.query('insert into community_group_attendance(meeting_id,student_id,is_present) values($1,$2,true)',[meeting,duplicate])
  await db.query('insert into follow_up_contact_merge_log(kept_student_id,merged_student_id) values($1,$2)',[student,duplicate])
  assert.equal((await db.query('select is_present from community_group_attendance where meeting_id=$1 and student_id=$2',[meeting,student])).rows[0].is_present,true)
  assert.equal((await db.query('select count(*)::int n from community_group_memberships where student_id=$1',[duplicate])).rows[0].n,0)
  // Deletion uses live permissions and optimistic versions; only its attendance cascades.
  revision=(await db.query('select revision from community_groups where id=$1',[group])).rows[0].revision
  const meetingVersion=(await db.query('select version from community_group_meetings where id=$1',[meeting])).rows[0].version
  await asUser(outsider)
  await assert.rejects(rpc('community_delete_meeting',[group,meeting,meetingVersion,revision]),/not available/)
  await asUser(leader)
  await db.query('update profiles set is_active=false where id=$1',[leader])
  await assert.rejects(rpc('community_delete_meeting',[group,meeting,meetingVersion,revision]),/not available/)
  await db.query('update profiles set is_active=true where id=$1',[leader])
  await db.query('delete from community_group_leaders where group_id=$1 and profile_id=$2',[group,leader])
  await assert.rejects(rpc('community_delete_meeting',[group,meeting,meetingVersion,revision]),/not available/)
  await db.query('insert into community_group_leaders(group_id,profile_id) values($1,$2)',[group,leader])
  await assert.rejects(rpc('community_delete_meeting',[second,meeting,meetingVersion,revision]),/no longer available/)
  await assert.rejects(rpc('community_delete_meeting',[group,meeting,meetingVersion-1,revision]),/changed/)
  await assert.rejects(rpc('community_delete_meeting',[group,meeting,meetingVersion,revision-1]),/changed/)
  await db.query('update community_groups set is_active=false where id=$1',[group])
  await assert.rejects(rpc('community_delete_meeting',[group,meeting,meetingVersion,revision]),/read-only/)
  await db.query('update community_groups set is_active=true where id=$1',[group])
  await db.query('update follow_up_campaigns set status=\'archived\' where id=$1',[campaign])
  await assert.rejects(rpc('community_delete_meeting',[group,meeting,meetingVersion,revision]),/read-only/)
  await assert.rejects(rpc('community_add_member',[group,student,today]),/read-only/)
  await assert.rejects(rpc('save_community_group_attendance',[group,today,[],[student],2,revision]),/read-only/)
  await db.query("update follow_up_campaigns set status='active' where id=$1",[campaign])
  const otherDate=(await db.query("select ((now() at time zone 'America/Detroit')::date-1)::text d")).rows[0].d
  const otherMeeting=(await db.query('insert into community_group_meetings(group_id,meeting_date) values($1,$2) returning id',[group,otherDate])).rows[0].id
  await db.query('insert into community_group_attendance(meeting_id,student_id,is_present) values($1,$2,true)',[otherMeeting,student])
  const rosterBefore=(await db.query('select * from community_group_memberships order by id')).rows
  const contactsBefore=(await db.query('select * from follow_up_contacts order by id')).rows
  await db.exec('set role anon')
  await assert.rejects(rpc('community_delete_meeting',[group,meeting,meetingVersion,revision]),/permission denied/)
  await db.exec('reset role; set role authenticated')
  await assert.rejects(db.query('delete from community_group_meetings where id=$1',[meeting]),/permission denied/)
  await rpc('community_delete_meeting',[group,meeting,meetingVersion,revision])
  await db.exec('reset role')
  assert.equal((await db.query('select * from community_group_meetings where id=$1',[meeting])).rows.length,0)
  assert.equal((await db.query('select * from community_group_attendance where meeting_id=$1',[meeting])).rows.length,0)
  assert.equal((await db.query('select * from community_group_attendance where meeting_id=$1',[otherMeeting])).rows.length,1)
  assert.deepEqual((await db.query('select * from community_group_memberships order by id')).rows,rosterBefore)
  assert.deepEqual((await db.query('select * from follow_up_contacts order by id')).rows,contactsBefore)
  await assert.rejects(rpc('save_community_group_attendance',[group,today,[student],[student],0,revision]),/changed/)
  await assert.rejects(rpc('community_delete_meeting',[group,meeting,meetingVersion,revision]),/no longer available/)
  await db.query('delete from follow_up_campaigns where id=$1',[campaign])
  assert.equal((await db.query('select count(*)::int n from community_groups')).rows[0].n,0)
})
