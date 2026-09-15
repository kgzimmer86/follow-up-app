import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const sql = name => readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
async function setup(t) {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table profiles(id uuid primary key,role text,is_active boolean default true,display_name text);
    create table follow_up_campaigns(id uuid primary key,status text,starts_on date,ends_on date);
    create table ministry_areas(id uuid primary key,parent_id uuid,is_active boolean default true);
    create table profile_ministry_area_assignments(profile_id uuid,campaign_id uuid,ministry_area_id uuid,is_default boolean);
    create table students(id uuid primary key,phone text,gender_raw text,display_name text,uniqname text);
    create table follow_up_contacts(id uuid primary key default gen_random_uuid(),campaign_id uuid references follow_up_campaigns on delete cascade,student_id uuid references students,status text default 'uncontacted',phone text,gender_raw text,contact_origin text,field_added_by uuid,location_resolution text,ministry_location_id uuid,primary_owner_id uuid,primary_assigned_at timestamptz,received_christ_at timestamptz,unique(campaign_id,student_id));
    create table follow_up_contact_merge_log(id uuid primary key default gen_random_uuid(),kept_student_id uuid,merged_student_id uuid);
    create table follow_up_events(id uuid primary key default gen_random_uuid(),contact_id uuid references follow_up_contacts,performed_by uuid,event_type text,contact_method text,text_purposes text[],text_event_name text,notes text,occurred_at timestamptz default now(),invited_to_community_group boolean default false);
    create function set_follow_up_contact_status(p_contact_id uuid,p_status text) returns void language sql as $$update public.follow_up_contacts set status=p_status where id=p_contact_id$$;
    create function private.is_approved_user() returns boolean language sql as $$select exists(select 1 from public.profiles where id=auth.uid() and is_active and role<>'pending')$$;
  `)
  await db.exec(await sql('20260911_community_groups_foundation'))
  await db.exec(await sql('20260914_community_events'))
  await db.exec(await sql('20260915_invitation_assignments'))
  await db.exec(await sql('20260917_community_checkin_attention'))
  await db.exec(await sql('20260919_leader_group_badges'))
  const attention = await sql('20260910_staff_handoffs_and_assignment_attention')
  await db.exec(attention.slice(attention.indexOf('create or replace function private.my_contact_attention_rows()'), attention.indexOf('create or replace function public.get_my_contact_attention_list(')))
  await db.exec(await sql('20260920_personal_push_notifications'))
  await db.exec(await sql('20260920_personal_push_notifications'))
  const ids = Object.fromEntries(['user','other','pending','inactive','campaign','area','event'].map(key => [key,randomUUID()]))
  await db.query("insert into profiles values($1,'admin',true,'Invented user'),($2,'student_leader',true,'Invented other'),($3,'pending',true,'Pending'),($4,'staff',false,'Inactive')",[ids.user,ids.other,ids.pending,ids.inactive])
  await db.query("insert into follow_up_campaigns values($1,'active',current_date-100,current_date+200)",[ids.campaign])
  await db.query('insert into ministry_areas(id) values($1)',[ids.area])
  await db.query("insert into community_events(id,campaign_id,name,event_date) values($1,$2,'Invented event',current_date+1)",[ids.event,ids.campaign])
  const asUser = id => db.query("select set_config('request.jwt.claim.sub',$1,false)",[id || ''])
  await asUser(ids.user)
  const register = async (endpoint='https://fcm.googleapis.com/fcm/send/test') => (await db.query('select follow_up_push_register($1,$2,$3) id',[endpoint,'B'.repeat(87),'A'.repeat(22)])).rows[0].id
  const claim = async () => (await db.query('select follow_up_push_claim() jobs')).rows[0].jobs
  const finish = job => db.query("select follow_up_push_finish($1,$2,$3,'sent')",[job.id,job.lease,job.snapshot.fingerprint])
  const due = () => db.exec("update private.follow_up_push_devices set next_check_at=now()-interval '1 second',lease_until=null")
  async function contact(owner=ids.user) {
    const student=randomUUID(), id=randomUUID()
    await db.query('insert into students(id) values($1)',[student])
    await db.query('insert into follow_up_contacts(id,campaign_id,student_id,primary_owner_id) values($1,$2,$3,$4)',[id,ids.campaign,student,owner])
    return {id,student}
  }
  return { db,ids,asUser,register,claim,finish,due,contact }
}

test('five assignments produce one device summary; unchanged work is quiet and equal-count replacements notify',async t => {
  const {db,ids,register,claim,finish,due,contact}=await setup(t)
  const device=await register()
  const contacts=[]
  for(let i=0;i<5;i++) contacts.push(await contact())
  await contact(ids.other)
  const jobs=await claim()
  assert.equal(jobs.length,1); assert.equal(jobs[0].id,device)
  assert.equal(jobs[0].snapshot.total,5)
  assert.equal((await claim()).length,0,'overlapping dispatcher cannot claim a leased device')
  await finish(jobs[0]); await due()
  assert.equal((await claim()).length,0,'unchanged fingerprint produces no push')
  await db.query('update follow_up_contacts set primary_owner_id=$1 where id=$2',[ids.other,contacts[0].id])
  await contact(); await due()
  const changed=await claim()
  assert.equal(changed.length,1); assert.equal(changed[0].snapshot.total,5)
  assert.notEqual(changed[0].snapshot.fingerprint,jobs[0].snapshot.fingerprint)
  await finish(changed[0])
  await db.query('update follow_up_contacts set primary_owner_id=$1',[ids.other]); await due()
  const cleared=await claim(); assert.equal(cleared[0].snapshot.total,0)
  await finish(cleared[0]); await due(); assert.equal((await claim()).length,0)
})

test('snapshot matches real badges: own initial invitations and explicitly led groups only',async t => {
  const {db,ids,register,claim,contact}=await setup(t)
  await register()
  const a=await contact(ids.other), b=await contact(ids.other)
  await db.query("insert into community_event_invitations(event_id,student_id,status,assigned_to,last_outreach_at,first_invited_at) values($1,$2,'not_asked',$4,null,null),($1,$3,'invited',$4,now()-interval '4 days',now()-interval '4 days')",[ids.event,a.student,b.student,ids.user])
  for (const lead of [true,false]) {
    const group=randomUUID()
    await db.query("insert into community_groups(id,campaign_id,ministry_area_id,name) values($1,$2,$3,'Invented group')",[group,ids.campaign,ids.area])
    if(lead) await db.query('insert into community_group_leaders(group_id,profile_id) values($1,$2)',[group,ids.user])
    await db.query('insert into community_group_memberships(group_id,student_id,started_on) values($1,$2,current_date-5)',[group,a.student])
    const meetings=(await db.query('insert into community_group_meetings(group_id,meeting_date) values($1,current_date-2),($1,current_date-1) returning id',[group])).rows
    for (const meeting of meetings) await db.query('insert into community_group_attendance(meeting_id,student_id,is_present) values($1,$2,false)',[meeting.id,a.student])
  }
  const [job]=await claim()
  assert.deepEqual({...job.snapshot,fingerprint:null},{contacts:0,invitations:1,groups:1,total:2,fingerprint:null})
  const counts=(await db.query('select community_workspace_counts() c')).rows[0].c
  assert.equal(job.snapshot.invitations,counts.initial); assert.equal(job.snapshot.groups,counts.groups)
  assert.equal(counts.reminders,1,'amber reminder is not included')
})

test('private queue permissions, ownership, account status, and identity restoration',async t => {
  const {db,ids,asUser,register,claim}=await setup(t)
  const device=await register()
  for(const role of ['anon','authenticated']) {
    for(const fn of ['public.follow_up_push_claim()','public.follow_up_push_finish(uuid,uuid,text,text)','private.follow_up_push_snapshot_for(uuid)','private.follow_up_push_snapshot()']) {
      assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,fn])).rows[0].allowed,false)
    }
  }
  await db.exec('set role authenticated')
  await assert.rejects(db.query('select * from private.follow_up_push_devices'),/permission denied/)
  await db.exec('reset role')
  await asUser(ids.other)
  assert.equal((await db.query("select follow_up_push_device('https://fcm.googleapis.com/fcm/send/test') d")).rows[0].d,null)
  await assert.rejects(register(),/switching accounts/)
  await db.query("select follow_up_push_remove('https://fcm.googleapis.com/fcm/send/test')")
  assert.equal((await db.query('select id from private.follow_up_push_devices')).rows[0].id,device)
  for(const id of [ids.pending,ids.inactive,null]) { await asUser(id); await assert.rejects(register(),/Active Follow Up/) }
  await asUser(ids.other)
  await claim()
  assert.equal((await db.query('select auth.uid() id')).rows[0].id,ids.other)
  await assert.rejects(db.query('select private.follow_up_push_snapshot_for($1)',[ids.inactive]),/Active Follow Up/)
  assert.equal((await db.query('select auth.uid() id')).rows[0].id,ids.other,'failure restores caller identity')
  await db.query('update profiles set is_active=false where id=$1',[ids.user])
  await db.exec('update private.follow_up_push_devices set lease_until=null')
  assert.deepEqual(await claim(),[])
  assert.equal((await db.query('select count(*)::int n from private.follow_up_push_devices')).rows[0].n,0)
})

test('registration validates endpoints, is idempotent, and caps devices; leases and retries are safe',async t => {
  const {db,register,claim,finish,due}=await setup(t)
  for(const endpoint of ['https://localhost/test','http://fcm.googleapis.com/test','https://fcm.googleapis.com.evil.test/a','https://evil@fcm.googleapis.com/a','https://fcm.googleapis.com:443/a']) await assert.rejects(register(endpoint),/Invalid browser/)
  const id=await register(); assert.equal(await register(),id)
  for(let i=1;i<10;i++) await register(`https://fcm.googleapis.com/fcm/send/test${i}`)
  await assert.rejects(register('https://fcm.googleapis.com/fcm/send/overlimit'),/limit/)
  const [first]=await claim()
  await db.query("select follow_up_push_finish($1,$2,'bad','sent')",[first.id,randomUUID()])
  assert.equal((await db.query('select last_fingerprint from private.follow_up_push_devices where id=$1',[first.id])).rows[0].last_fingerprint,null)
  await db.query("select follow_up_push_finish($1,$2,$3,'retry')",[first.id,first.lease,first.snapshot.fingerprint])
  assert.equal((await db.query('select failures from private.follow_up_push_devices where id=$1',[first.id])).rows[0].failures,1)
  await due(); const retry=(await claim()).find(job=>job.id===first.id)
  assert.notEqual(retry.lease,first.lease)
  await finish(first)
  assert.equal((await db.query('select last_fingerprint from private.follow_up_push_devices where id=$1',[first.id])).rows[0].last_fingerprint,null)
  await db.query("select follow_up_push_finish($1,$2,null,'expired')",[retry.id,retry.lease])
  assert.equal((await db.query('select count(*)::int n from private.follow_up_push_devices where id=$1',[first.id])).rows[0].n,0)
})

test('one dispatcher isolates multiple recipients and reuses a recipient snapshot for their devices',async t=>{
  const {db,ids,asUser,register,claim,contact}=await setup(t)
  const first=await register()
  const second=await register('https://web.push.apple.com/second-device')
  await contact();await contact()
  await asUser(ids.other)
  const other=await register('https://web.push.apple.com/other-account')
  await contact(ids.other)
  const jobs=await claim()
  assert.equal(jobs.find(job=>job.id===first).snapshot.total,2)
  assert.equal(jobs.find(job=>job.id===second).snapshot.total,2)
  assert.equal(jobs.find(job=>job.id===other).snapshot.total,1)
  assert.equal((await db.query('select auth.uid() id')).rows[0].id,ids.other)
})

test('time-only attention changes enter the next snapshot without changing ownership',async t=>{
  const {db,register,claim,contact,finish,due}=await setup(t)
  await register()
  const a=await contact()
  await db.query("update follow_up_contacts set status='go_back',received_christ_at=now()-interval '23 hours' where id=$1",[a.id])
  await db.query("insert into follow_up_events(contact_id,performed_by,event_type,occurred_at) select id,primary_owner_id,'interaction',now()-interval '6 days' from follow_up_contacts where id=$1",[a.id])
  const initial=(await claim())[0];assert.equal(initial.snapshot.total,0);await finish(initial)
  await db.query("update follow_up_contacts set received_christ_at=now()-interval '25 hours' where id=$1",[a.id])
  await due();const next=(await claim())[0];assert.equal(next.snapshot.total,1)
})
