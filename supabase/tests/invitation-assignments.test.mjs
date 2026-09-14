import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const sql = name => readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
async function setup(t) {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`
    create role authenticated; create role anon; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table profiles(id uuid primary key,role text,is_active boolean default true,display_name text);
    create table follow_up_campaigns(id uuid primary key,status text,starts_on date,ends_on date);
    create table ministry_areas(id uuid primary key,parent_id uuid,is_active boolean default true);
    create table profile_ministry_area_assignments(profile_id uuid,campaign_id uuid,ministry_area_id uuid,is_default boolean);
    create table students(id uuid primary key,phone text,gender_raw text,display_name text,uniqname text);
    create table follow_up_contacts(id uuid primary key default gen_random_uuid(),campaign_id uuid references follow_up_campaigns on delete cascade,student_id uuid references students,status text default 'uncontacted',phone text,gender_raw text,contact_origin text,field_added_by uuid,location_resolution text,ministry_location_id uuid,primary_owner_id uuid,unique(campaign_id,student_id));
    create table follow_up_contact_merge_log(id uuid primary key default gen_random_uuid(),kept_student_id uuid,merged_student_id uuid);
    create table follow_up_events(id uuid primary key default gen_random_uuid(),contact_id uuid references follow_up_contacts,performed_by uuid,event_type text,contact_method text,text_purposes text[],text_event_name text,notes text);
    create function set_follow_up_contact_status(p_contact_id uuid,p_status text) returns void language sql as $$update public.follow_up_contacts set status=p_status where id=p_contact_id$$;
    create function private.is_approved_user() returns boolean language sql as $$select exists(select 1 from public.profiles where id=auth.uid() and is_active and role<>'pending')$$;
    -- Spy for the unchanged existing interaction routine: tests atomic dispatch,
    -- errors, and explicit ownership intent, not its full production internals.
    create function log_interaction(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean) returns uuid language plpgsql as $$declare h uuid; begin
      if $2 like '%FAIL%' then raise exception 'Interaction rejected'; end if;
      insert into public.follow_up_events(contact_id,performed_by,event_type,notes) values($1,auth.uid(),'interaction',$2) returning id into h;
      if $9 then update public.follow_up_contacts set primary_owner_id=auth.uid() where id=$1; end if;
      return h;
    end; $$;
  `)
  const textSql=await sql('20260908_text_attempts')
  await db.exec(textSql.slice(textSql.indexOf('create or replace function public.log_text_attempt('),textSql.indexOf('$log_text_attempt$;')+'$log_text_attempt$;'.length))
  await db.exec(await sql('20260911_community_groups_foundation'))
  await db.exec(await sql('20260914_community_events'))
  await db.exec(await sql('20260915_invitation_assignments'))
  const ids=Object.fromEntries(['campaign','admin','staff','leader','discipler','other','pending','inactive','area'].map(k=>[k,randomUUID()]))
  await db.query("insert into follow_up_campaigns values($1,'active',current_date-100,current_date+200)",[ids.campaign])
  await db.query('insert into ministry_areas(id) values($1)',[ids.area])
  for (const r of ['admin','staff','leader','discipler','other','pending','inactive']) {
    await db.query('insert into profiles values($1,$2,$3,$4)',[ids[r],['leader','other','inactive'].includes(r)?'student_leader':r,r!=='inactive',r])
  }
  const asUser=id=>db.query("select set_config('test.user',$1,false)",[id])
  const rpc=async(name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) r`,args)).rows[0].r
  await asUser(ids.admin)
  ids.event=await rpc('community_save_event',[ids.campaign,null,'Test gathering',new Date(Date.now()+86400000*10).toISOString().slice(0,10),'','',true,0])
  const contact=async(name='Invented student')=>{
    const student=randomUUID(),id=randomUUID()
    await db.query('insert into students(id,display_name) values($1,$2)',[student,name])
    await db.query('insert into follow_up_contacts(id,campaign_id,student_id,primary_owner_id,ministry_location_id) values($1,$2,$3,$4,$5)',[id,ids.campaign,student,ids.staff,ids.area])
    return {id,student}
  }
  const invitation=async s=>(await db.query('select * from community_event_invitations where event_id=$1 and student_id=$2',[ids.event,s])).rows[0]
  const assign=(contacts,to,versions={})=>rpc('community_assign_invitations',[ids.event,contacts.map(c=>c.id),to,Object.fromEntries(contacts.map(c=>[c.id,versions[c.id]??0]))])
  const log=(c,method='text',response=null,submission=randomUUID(),payload={})=>rpc('community_log_outreach',[submission,ids.event,c.id,response,method,payload])
  return {db,ids,asUser,rpc,contact,invitation,assign,log}
}

test('installed void interaction logger connects atomically to invitations without changing normal Follow Up', async t => {
  const {db,ids,contact,assign,log,invitation}=await setup(t)
  await db.exec(`drop function public.log_interaction(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean);
    alter table follow_up_events add column occurred_at timestamptz, add column had_spiritual_conversation boolean,
      add column interview_completed boolean, add column kgp_shared boolean, add column received_christ boolean,
      add column invited_to_community_group boolean, add column status_after text, add column found_home boolean;`)
  await db.exec(await readFile(new URL('./fixtures/installed-log-interaction.sql',import.meta.url),'utf8'))
  const a=await contact(); await assign([a],ids.leader)
  await assert.rejects(log(a,'interaction','coming',randomUUID(),{p_status_after:'go_back'}),/invalid input syntax for type uuid/)
  assert.equal((await db.query('select count(*)::int n from follow_up_events')).rows[0].n,0,'original failure rolls back interaction')
  const original=(await db.query("select pg_get_functiondef('public.log_interaction(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean)'::regprocedure) d")).rows[0].d
  await db.exec(await sql('20260916_invitation_interaction_return'))
  await db.exec(await sql('20260916_invitation_interaction_return'))
  assert.equal((await db.query("select pg_get_functiondef('public.log_interaction(uuid,text,boolean,boolean,boolean,boolean,boolean,text,boolean,boolean)'::regprocedure) d")).rows[0].d,original)
  const submission=randomUUID()
  const history=await log(a,'interaction','coming',submission,{p_status_after:'go_back',p_received_christ:true})
  assert.equal(await log(a,'interaction','coming',submission,{p_status_after:'go_back'}),history)
  const rows=(await db.query('select * from follow_up_events')).rows
  assert.equal(rows.length,1); assert.equal(rows[0].id,history)
  assert.equal(rows[0].received_christ,true); assert.equal(rows[0].kgp_shared,true)
  assert.equal(rows[0].status_after,'go_back'); assert.match(rows[0].notes,/Test gathering/)
  assert.equal((await invitation(a.student)).status,'coming')
  assert.equal((await invitation(a.student)).assigned_to,ids.leader)
  await assert.rejects(log(a,'interaction','invalid',randomUUID(),{p_status_after:'go_back',p_make_primary:true}),/response|status/i)
  assert.equal((await db.query('select count(*)::int n from follow_up_events')).rows[0].n,1,'invitation failure rolls back interaction')
  assert.equal((await db.query('select primary_owner_id from follow_up_contacts where id=$1',[a.id])).rows[0].primary_owner_id,ids.staff)
})

test('workspace badge counts match two explicit absences and respect group access', async t => {
  const {db,ids,contact,assign,rpc,asUser}=await setup(t)
  await db.exec(await sql('20260917_community_attention_badges'))
  const a=await contact(); await assign([a],ids.admin)
  const group=randomUUID(),m1=randomUUID(),m2=randomUUID()
  await db.query("insert into community_groups(id,campaign_id,ministry_area_id,name) values($1,$2,$3,'Test')",[group,ids.campaign,ids.area])
  await db.query('insert into community_group_memberships(group_id,student_id,started_on) values($1,$2,current_date-10)',[group,a.student])
  await db.query('insert into community_group_meetings(id,group_id,meeting_date) values($1,$3,current_date-2),($2,$3,current_date-1)',[m1,m2,group])
  await db.query('insert into community_group_attendance(meeting_id,student_id,is_present) values($1,$3,false),($2,$3,false)',[m1,m2,a.student])
  assert.deepEqual(await rpc('community_workspace_counts'),{initial:1,reminders:0,groups:1})
  await asUser(ids.leader); assert.equal((await rpc('community_workspace_counts')).groups,0)
  await db.query('insert into community_group_leaders(group_id,profile_id) values($1,$2)',[group,ids.leader])
  assert.equal((await rpc('community_workspace_counts')).groups,1)
  await db.query('delete from community_group_attendance where meeting_id=$1',[m2])
  assert.equal((await rpc('community_workspace_counts')).groups,0,'missing is not absent')
  await db.query('insert into community_group_attendance(meeting_id,student_id,is_present) values($1,$2,false)',[m2,a.student])
  await db.query('update community_group_memberships set started_on=current_date where group_id=$1',[group])
  assert.equal((await rpc('community_workspace_counts')).groups,0,'restored membership does not inherit old absence streak')
  await db.exec('alter table follow_up_events add column occurred_at timestamptz default now(), add column invited_to_community_group boolean default false')
  await db.exec(await sql('20260917_community_checkin_attention'))
  await db.query('update community_group_memberships set started_on=current_date-10 where group_id=$1',[group])
  assert.equal((await rpc('community_workspace_counts')).groups,1)
  const checkin=randomUUID()
  await db.query("insert into follow_up_events(id,contact_id,event_type,invited_to_community_group) values($1,$2,'interaction',true)",[checkin,a.id])
  assert.equal((await rpc('community_workspace_counts')).groups,0,'CG interaction clears reminder')
  assert.equal((await db.query('select * from community_group_checkin_attention($1)',[group])).rows.length,0)
  await db.query("update follow_up_events set occurred_at=now()-interval '3 days' where id=$1",[checkin])
  assert.equal((await rpc('community_workspace_counts')).groups,1,'two meetings after check-in reopen reminder')
  await db.query("update follow_up_contacts set status='not_interested' where id=$1",[a.id])
  assert.equal((await rpc('community_workspace_counts')).groups,0,'not interested clears reminder')
  await db.query("update follow_up_contacts set status='go_back' where id=$1",[a.id])
  await db.query('update community_group_attendance set is_present=true where meeting_id=$1',[m2])
  assert.equal((await rpc('community_workspace_counts')).groups,0,'attending clears reminder')
  await db.query('update community_group_attendance set is_present=false where meeting_id=$1',[m2])
  await db.query('update community_group_memberships set ended_on=current_date where group_id=$1',[group])
  assert.equal((await rpc('community_workspace_counts')).groups,0,'leaving roster clears reminder')
})

test('test reminder aging changes one invented invitation and safely restores its clock', async t => {
  const {db,ids,assign,log,invitation}=await setup(t)
  await db.exec("alter table follow_up_campaigns add column label text default 'TEST ONLY'; alter table students add column umich_email text")
  await db.query("update community_events set name='TEST reminder' where id=$1",[ids.event])
  const c={id:randomUUID(),student:'d3140001-0000-4000-8000-000000000001'}
  await db.query("insert into students(id,display_name,umich_email) values($1,'INVITE TEST 01 Alex','invitetest01@example.invalid')",[c.student])
  await db.query('insert into follow_up_contacts(id,campaign_id,student_id) values($1,$2,$3)',[c.id,ids.campaign,c.student])
  await assign([c],ids.leader); await log(c,'text','invited')
  const before=await invitation(c.student)
  const script=(await readFile(new URL('./age-one-invitation-reminder.sql',import.meta.url),'utf8')).replaceAll('290aaf10-2d90-4b60-8768-723e6470baf4',ids.campaign)
  const results=await db.exec(script)
  const result=results.flatMap(r=>r.rows).find(r=>r.restore_sql)
  assert.ok(result)
  assert.ok(new Date((await invitation(c.student)).last_outreach_at)<new Date(Date.now()-72*3600000))
  assert.equal((await db.query(result.restore_sql)).rows.length,1)
  assert.deepEqual((await invitation(c.student)).last_outreach_at,before.last_outreach_at)
  assert.equal((await db.query(result.restore_sql)).rows.length,0,'stale restoration cannot overwrite newer activity')
})

test('assignment roles, stale claims, bulk atomicity and broad contacts without ownership changes',async t=>{
  const {db,ids,asUser,rpc,contact,invitation,assign}=await setup(t)
  const a=await contact('Alpha'),b=await contact('Beta')
  await asUser(ids.leader)
  await assert.rejects(assign([a],ids.other),/themselves/)
  assert.equal(await assign([a],ids.leader),1)
  await asUser(ids.discipler)
  await assert.rejects(assign([a],ids.other),/changed/)
  await assert.rejects(assign([a],ids.other,{[a.id]:1}),/already assigned/)
  await assert.rejects(assign([b],ids.staff),/Disciplers/)
  assert.equal(await assign([b],ids.other),1)
  await asUser(ids.admin)
  await assert.rejects(assign([a,b],ids.admin,{[a.id]:1,[b.id]:0}),/changed/)
  assert.equal((await invitation(a.student)).assigned_to,ids.leader,'bulk error rolls back earlier updates')
  assert.equal(await assign([a,b],ids.admin,{[a.id]:1,[b.id]:1}),2)
  assert.deepEqual(await rpc('community_invite_counts'),{initial:2,reminders:0})
  assert.ok((await db.query('select primary_owner_id from follow_up_contacts')).rows.every(r=>r.primary_owner_id===ids.staff))
  const result=await rpc('community_invitation_workspace',[null,true,'',null,1])
  assert.equal(result.total,2); assert.equal(result.rows[0].display_name,'Alpha')
  await asUser(ids.pending); await assert.rejects(rpc('community_invite_counts'),/Active/)
  await asUser(ids.inactive); await assert.rejects(rpc('community_invitation_workspace',[ids.event,false,'',null,1]),/Active/)
  await asUser(ids.admin); await db.exec('set role anon')
  await assert.rejects(rpc('community_invite_counts'),/permission denied/)
  await db.exec('reset role')
})

test('confirmed outreach completes shared assignment, retries once, preserves responses and resets only on outreach',async t=>{
  const {db,ids,asUser,rpc,contact,invitation,assign,log}=await setup(t)
  const a=await contact(),b=await contact()
  await assign([a],ids.leader)
  await asUser(ids.other)
  const submission=randomUUID()
  const history=await log(a,'text',null,submission,{p_purposes:['follow_up'],p_notes:'Hello'})
  let row=await invitation(a.student)
  assert.equal(row.assigned_to,ids.leader); assert.equal(row.status,'invited')
  assert.equal(await log(a,'text',null,submission),history)
  assert.deepEqual((await invitation(a.student)).last_outreach_at,row.last_outreach_at)
  assert.equal((await db.query('select * from follow_up_events')).rows.length,1)
  assert.equal((await db.query('select * from community_invitation_outreach')).rows.length,1)
  await assert.rejects(log(a,'interaction',null,submission),/identifier/)
  await db.query("update community_event_invitations set last_outreach_at=now()-interval '73 hours' where student_id=$1",[a.student])
  await asUser(ids.leader)
  assert.deepEqual(await rpc('community_invite_counts'),{initial:0,reminders:1})
  await rpc('community_invitation_response',[ids.event,a.id,'maybe',row.version])
  row=await invitation(a.student)
  assert.ok(new Date(row.last_outreach_at)<new Date(Date.now()-72*3600000),'response alone does not reset outreach clock')
  assert.deepEqual(await rpc('community_invite_counts'),{initial:0,reminders:0})
  await asUser(ids.other)
  await log(a,'interaction')
  assert.equal((await invitation(a.student)).status,'maybe','reminder preserves known response')
  assert.equal((await invitation(a.student)).assigned_to,ids.leader)
  await log(b)
  assert.equal((await invitation(b.student)).assigned_to,ids.other,'recorder becomes event-specific responsible person')
  await assert.rejects(assign([b],ids.other,{[b.id]:1}),/already been invited/)
  assert.ok((await db.query('select primary_owner_id from follow_up_contacts')).rows.every(r=>r.primary_owner_id===ids.staff))
})

test('outreach failures roll back history and task state; closure/date expiry remove cues',async t=>{
  const {db,ids,rpc,contact,invitation,assign,log}=await setup(t)
  const a=await contact()
  await assign([a],ids.admin)
  await assert.rejects(log(a,'interaction',null,randomUUID(),{p_notes:'FAIL'}),/Interaction rejected/)
  await assert.rejects(log(a,'interaction','bad'),/valid response/)
  assert.equal((await db.query('select * from follow_up_events')).rows.length,0)
  assert.equal((await invitation(a.student)).status,'not_asked')
  await db.query('update community_events set is_open=false where id=$1',[ids.event])
  assert.deepEqual(await rpc('community_invite_counts'),{initial:0,reminders:0})
  await assert.rejects(log(a),/closed/)
  await db.query("update community_events set is_open=true,event_date=(now() at time zone 'America/Detroit')::date-1 where id=$1",[ids.event])
  assert.deepEqual(await rpc('community_invite_counts'),{initial:0,reminders:0})
  await assert.rejects(log(a),/passed/)
  const workspace=await rpc('community_invitation_workspace',[null,true,'',null,1])
  assert.equal(workspace.rows[0].cue,'history'); assert.equal(workspace.total,1)
})

test('merge retains responsibility and outreach ledger without reviving initial task',async t=>{
  const {db,ids,contact,invitation,assign,log}=await setup(t)
  const a=await contact(),b=await contact()
  await assign([a],ids.leader); await log(b,'text','coming')
  await db.query("update community_event_invitations set updated_at=now()+interval '1 minute' where student_id=$1",[a.student])
  await db.query('insert into follow_up_contact_merge_log(kept_student_id,merged_student_id) values($1,$2)',[a.student,b.student])
  const row=await invitation(a.student)
  assert.equal(row.assigned_to,ids.leader); assert.equal(row.status,'coming'); assert.ok(row.first_invited_at)
  assert.equal(await invitation(b.student),undefined)
  assert.equal((await db.query('select student_id from community_invitation_outreach')).rows[0].student_id,a.student)
})

test('badge count uses assignee index with a larger invented dataset',async t=>{
  const {db,ids,rpc,contact,assign}=await setup(t)
  await assign([await contact()],ids.admin)
  await db.query("insert into students(id,display_name) select gen_random_uuid(),'Scale example' from generate_series(1,10000)")
  await db.query("insert into community_event_invitations(event_id,student_id,status,assigned_to) select $1,id,'not_asked',$2 from students where display_name='Scale example'",[ids.event,ids.other])
  await db.exec('analyze community_event_invitations; analyze community_events; analyze follow_up_campaigns')
  const plan=await db.query(`explain (analyze,format json) select count(*) filter(where i.first_invited_at is null and i.status='not_asked'),count(*) filter(where i.status='invited' and i.last_outreach_at<=now()-interval '3 days')
    from community_event_invitations i join community_events e on e.id=i.event_id join follow_up_campaigns c on c.id=e.campaign_id and c.status='active'
    where i.assigned_to=auth.uid() and e.is_open and e.event_date>=(now() at time zone 'America/Detroit')::date`)
  assert.match(JSON.stringify(plan.rows),/community_invitation_assignee/)
  assert.deepEqual(await rpc('community_invite_counts'),{initial:1,reminders:0})
  t.diagnostic('10,001 invented invitations; PostgreSQL chose the assignee index for the badge query. This is not a hosted launch-time benchmark.')
})
