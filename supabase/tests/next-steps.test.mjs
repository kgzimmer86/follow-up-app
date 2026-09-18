import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const sql = name => readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')
const migration = '20260923_personal_next_steps'
async function setup(t, push = false) {
  const db = new PGlite(); t.after(() => db.close())
  // Invented records and reduced core schema. Use the installed interaction body
  // and real Community/photo adapters; production progress triggers are not cloned.
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema private;
    grant usage on schema auth,private to authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table profiles(id uuid primary key,role text,is_active boolean default true,display_name text);
    create table follow_up_campaigns(id uuid primary key,status text,starts_on date,ends_on date);
    create table ministry_areas(id uuid primary key,parent_id uuid,is_active boolean default true);
    create table profile_ministry_area_assignments(profile_id uuid,campaign_id uuid,ministry_area_id uuid,is_default boolean);
    create table students(id uuid primary key,phone text,gender_raw text,display_name text,uniqname text);
    create table follow_up_contacts(id uuid primary key default gen_random_uuid(),campaign_id uuid references follow_up_campaigns,student_id uuid references students,status text default 'go_back',phone text,gender_raw text,contact_origin text,field_added_by uuid,location_resolution text,ministry_location_id uuid,primary_owner_id uuid,primary_assigned_at timestamptz,received_christ_at timestamptz,unique(campaign_id,student_id));
    create table follow_up_contact_merge_log(id uuid primary key default gen_random_uuid(),kept_student_id uuid,merged_student_id uuid,kept_contact_id uuid,merged_contact_id uuid);
    create table follow_up_events(id uuid primary key default gen_random_uuid(),contact_id uuid references follow_up_contacts,performed_by uuid,event_type text,contact_method text,text_purposes text[],text_event_name text,notes text,occurred_at timestamptz default now(),invited_to_community_group boolean default false,had_spiritual_conversation boolean,interview_completed boolean,kgp_shared boolean,received_christ boolean,status_after text,found_home boolean,attachment_path text,attachment_name text,attachment_mime_type text,attachment_size_bytes integer);
    create function set_follow_up_contact_status(p_contact_id uuid,p_status text) returns void language sql as $$update public.follow_up_contacts set status=p_status where id=p_contact_id$$;
    create function private.is_approved_user() returns boolean language sql security definer set search_path='' as $$select exists(select 1 from public.profiles where id=auth.uid() and is_active and role<>'pending')$$;
    grant select on follow_up_contacts,follow_up_campaigns to authenticated;
  `)
  await db.exec(await readFile(new URL('./fixtures/installed-log-interaction.sql', import.meta.url), 'utf8'))
  for (const name of ['20260911_community_groups_foundation','20260914_community_events','20260915_invitation_assignments','20260916_invitation_interaction_return']) await db.exec(await sql(name))
  const photo = await sql('20260908_interaction_photos')
  const start = photo.indexOf('create or replace function public.log_interaction_with_attachment(')
  await db.exec(photo.slice(start, photo.indexOf('$function$;', start) + '$function$;'.length))
  await db.exec(await sql(migration))
  if (push) {
    for (const name of ['20260917_community_checkin_attention','20260919_leader_group_badges']) await db.exec(await sql(name))
    const attention = await sql('20260910_staff_handoffs_and_assignment_attention')
    await db.exec(attention.slice(attention.indexOf('create or replace function private.my_contact_attention_rows()'), attention.indexOf('create or replace function public.get_my_contact_attention_list(')))
    await db.exec(await sql('20260920_personal_push_notifications'))
    await db.exec(await sql('20260923_personal_next_steps_push'))
    await db.exec(await sql('20260924_attention_next_steps'))
  }
  const ids = Object.fromEntries(['user','other','staff','admin','discipler','inactive','pending','campaign','archived','area','otherArea','event'].map(key => [key,randomUUID()]))
  await db.query("insert into profiles values($1,'student_leader',true,'Invented Leader'),($2,'student_leader',true,'Invented Other'),($3,'staff',true,'Invented Staff'),($4,'admin',true,'Invented Admin'),($5,'discipler',true,'Invented Discipler'),($6,'staff',false,'Inactive'),($7,'pending',true,'Pending')",[ids.user,ids.other,ids.staff,ids.admin,ids.discipler,ids.inactive,ids.pending])
  await db.query("insert into follow_up_campaigns values($1,'active',current_date-100,current_date+200),($2,'archived',current_date-400,current_date-200)",[ids.campaign,ids.archived])
  await db.query('insert into ministry_areas(id) values($1),($2)',[ids.area,ids.otherArea])
  await db.query("insert into community_events(id,campaign_id,name,event_date) values($1,$2,'Invented Gathering',current_date+3)",[ids.event,ids.campaign])
  const asUser = async id => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id ?? '']); await db.exec('set role authenticated') }
  const root = async work => { await db.exec('reset role'); try { return await work() } finally { await db.exec('set role authenticated') } }
  const rpc = async (name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result
  const contact = async (campaign=ids.campaign,area=ids.area) => root(async () => {
    const student=randomUUID(), id=randomUUID()
    await db.query("insert into students(id,display_name) values($1,'Invented Student')",[student])
    await db.query('insert into follow_up_contacts(id,campaign_id,student_id,primary_owner_id,ministry_location_id) values($1,$2,$3,$4,$5)',[id,campaign,student,ids.other,area])
    return id
  })
  const tomorrow = new Date(Date.now()+86400000).toISOString()
  const save = (c,id=randomUUID(),action='Write a personal plan',due=tomorrow,version=0) => rpc('follow_up_next_step_save',[id,c,action,due,version])
  const list = (...args) => rpc('follow_up_next_steps_list',args)
  const record = (id,c,submission=randomUUID(),version=1,payload={},event=null,response=null) => rpc('follow_up_next_step_record',[id,version,submission,{p_contact_id:c,p_notes:'Invented conversation',...payload},event,response])
  await asUser(ids.user)
  return {db,ids,asUser,root,rpc,contact,save,list,record,tomorrow}
}

test('personal plans validate input, remain private, and preserve existing data',async t => {
  const {db,ids,asUser,root,contact,save,list,rpc}=await setup(t)
  const c=await contact(), before=await root(()=>db.query('select * from follow_up_contacts where id=$1',[c]))
  const id=await save(c)
  assert.equal((await list())[0].id,id)
  assert.equal((await db.query('select * from follow_up_next_steps')).rows.length,1)
  assert.deepEqual(await root(()=>db.query('select * from follow_up_contacts where id=$1',[c])),before)
  assert.equal((await root(()=>db.query('select count(*)::int n from follow_up_events'))).rows[0].n,0)
  await assert.rejects(db.query("update follow_up_next_steps set action='forged'"),/permission denied/)
  for(const actor of [ids.other,ids.staff,ids.admin,ids.discipler]) {
    await asUser(actor); assert.deepEqual(await list(),[])
    assert.equal((await db.query('select * from follow_up_next_steps')).rows.length,0)
    await assert.rejects(rpc('follow_up_next_step_clear',[id,1]),/unavailable/)
    await assert.rejects(save(c,id),/unavailable/)
  }
  for(const actor of [ids.inactive,ids.pending,null]) { await asUser(actor); await assert.rejects(list(),/Active Follow Up/); await assert.rejects(save(c),/Active Follow Up/) }
  await asUser(ids.user)
  for(const action of ['', '  ', 'a'.repeat(501)]) await assert.rejects(save(await contact(),randomUUID(),action),/between 1 and 500/)
  for(const due of [null,'infinity',new Date(Date.now()-86400000).toISOString(),new Date(Date.now()+370*86400000).toISOString()]) await assert.rejects(save(await contact(),randomUUID(),'Plan',due),/future time/)
  await assert.rejects(save(await contact(ids.archived)),/active campaign/)
  await assert.rejects(rpc('follow_up_next_steps_list',[null,null,randomUUID()]),/cursor/)
})

test('all approved roles retain active campaign scope, including cross-area contacts; steps stay author-owned',async t=>{
  const {ids,asUser,contact,save,list}=await setup(t)
  const c=await contact(ids.campaign,ids.otherArea)
  for(const role of ['user','staff','admin','discipler']) { await asUser(ids[role]); await save(c); assert.equal((await list()).length,1) }
})

test('retries and stale edits do not duplicate or overwrite steps',async t=>{
  const {contact,save,list,rpc,tomorrow}=await setup(t)
  const c=await contact(),id=randomUUID()
  assert.equal(await save(c,id),id); assert.equal(await save(c,id),id)
  await assert.rejects(save(c),/already have a pending/)
  const due=new Date(Date.now()+2*86400000).toISOString()
  await save(c,id,'Updated plan',due,1)
  await save(c,id,'Updated plan',due,1)
  assert.equal((await list())[0].version,2)
  await assert.rejects(save(c,id,'Stale edit',tomorrow,1),/changed/)
  await assert.rejects(rpc('follow_up_next_step_clear',[id,1]),/changed/)
  await rpc('follow_up_next_step_clear',[id,2]); await rpc('follow_up_next_step_clear',[id,2])
  assert.deepEqual(await list(),[])
  await assert.rejects(save(c,id,'Reopen',due,3),/no longer pending/)
  await save(c)
})

test('interaction completion is atomic, retryable, and bound to the owner/contact/version',async t=>{
  const {db,ids,asUser,root,contact,save,list,record,rpc}=await setup(t)
  const c=await contact(), wrong=await contact(), id=await save(c), token=randomUUID()
  await assert.rejects(record(id,wrong,token),/does not match/)
  await assert.rejects(record(id,c,token,0),/changed/)
  await assert.rejects(record(id,c,token,1,{p_status_after:'invalid'}),/Invalid Follow Up status/)
  assert.equal((await list()).length,1)
  assert.equal((await root(()=>db.query('select count(*)::int n from follow_up_events'))).rows[0].n,0)
  await asUser(ids.other); await assert.rejects(record(id,c,token),/unavailable/); await asUser(ids.user)
  const event=await record(id,c,token,1,{p_had_spiritual_conversation:true,p_interview_completed:true,p_found_home:true})
  assert.equal(await record(id,c,token),event)
  await assert.rejects(record(id,c),/changed/)
  const events=(await root(()=>db.query('select * from follow_up_events'))).rows
  assert.equal(events.length,1); assert.equal(events[0].had_spiritual_conversation,true); assert.equal(events[0].interview_completed,true)
  assert.equal(events[0].performed_by,ids.user)
  assert.equal((await root(()=>db.query('select primary_owner_id from follow_up_contacts where id=$1',[c]))).rows[0].primary_owner_id,ids.other)
  assert.deepEqual(await list(),[])
  await assert.rejects(rpc('follow_up_next_step_clear',[id,2]),/changed/)
  await root(()=>db.query('delete from follow_up_events where id=$1',[event]))
  assert.equal((await root(()=>db.query('select status from follow_up_next_steps where id=$1',[id]))).rows[0].status,'completed','history deletion does not reopen or destroy the intention')
})

test('first interaction validation, photos, and event invitations use the existing loggers',async t=>{
  const {db,ids,root,contact,save,list,record}=await setup(t)
  const c=await contact(),id=await save(c)
  await root(()=>db.query("update follow_up_contacts set status='uncontacted' where id=$1",[c]))
  await assert.rejects(record(id,c),/Choose a new status/)
  await assert.rejects(record(id,c,randomUUID(),1,{p_status_after:'go_back',p_attachment_path:'invalid',p_attachment_name:'test.jpg',p_attachment_mime_type:'image/jpeg',p_attachment_size_bytes:100}),/Invalid interaction photo path/)
  const payload={p_status_after:'go_back',p_make_primary:true,p_attachment_path:`interaction-attachments/${c}/${randomUUID()}.jpg`,p_attachment_name:'invented.jpg',p_attachment_mime_type:'image/jpeg',p_attachment_size_bytes:100}
  await assert.rejects(record(id,c,randomUUID(),1,payload,ids.event,'invalid'),/response|status/i)
  assert.equal((await list()).length,1)
  assert.equal((await root(()=>db.query('select count(*)::int n from follow_up_events'))).rows[0].n,0)
  assert.equal((await root(()=>db.query('select primary_owner_id from follow_up_contacts where id=$1',[c]))).rows[0].primary_owner_id,ids.other,'invitation rejection rolls back assignment too')
  const event=await record(id,c,randomUUID(),1,payload,ids.event,'coming')
  assert.equal((await root(()=>db.query('select attachment_path from follow_up_events where id=$1',[event]))).rows[0].attachment_path,payload.p_attachment_path)
  assert.equal((await root(()=>db.query('select status from community_event_invitations'))).rows[0].status,'coming')
})

test('reviewed contact merge preserves both plans and invalidates stale forms',async t=>{
  const {db,root,contact,save,list}=await setup(t)
  const keep=await contact(),source=await contact(),first=await save(keep),second=await save(source)
  await root(()=>db.query('insert into follow_up_contact_merge_log(kept_contact_id,merged_contact_id,kept_student_id,merged_student_id) select $1,$2,k.student_id,s.student_id from follow_up_contacts k,follow_up_contacts s where k.id=$1 and s.id=$2',[keep,source]))
  await root(()=>db.query('delete from follow_up_contacts where id=$1',[source]))
  const rows=await list()
  assert.equal(rows.length,2); assert.ok(rows.every(n=>n.contact_id===keep))
  assert.equal(rows.find(n=>n.id===first).version,1); assert.equal(rows.find(n=>n.id===second).version,2)
})

test('keyset pagination does not drop equal-time steps and completed/archived work is excluded',async t=>{
  const {db,ids,root,contact,save,list,tomorrow}=await setup(t)
  for(let i=0;i<55;i++) await save(await contact(),randomUUID(),`Invented plan ${i}`,tomorrow)
  const page=await list(); assert.equal(page.length,51)
  const after=page[49], second=await list(null,after.due_at,after.id)
  assert.equal(second.length,5); assert.equal(new Set([...page.slice(0,50),...second].map(n=>n.id)).size,55)
  await root(()=>db.query("update follow_up_campaigns set status='archived' where id=$1",[ids.campaign]))
  assert.deepEqual(await list(),[])
})

test('due steps extend the existing push summary with a name but no conversation or plan content',async t=>{
  const {db,root,rpc,contact,save,record,tomorrow}=await setup(t,true)
  const c=await contact(),id=await save(c)
  const snapshot=()=>root(async()=>(await db.query('select private.follow_up_push_snapshot() s')).rows[0].s)
  const before=await snapshot(); assert.equal(before.nextSteps,0)
  await root(()=>db.query("update follow_up_next_steps set due_at=now()-interval '1 minute' where id=$1",[id]))
  const due=await snapshot(); assert.equal(due.nextSteps,1); assert.equal(due.total,before.total+1)
  assert.equal(await rpc('follow_up_next_step_due_count'),1)
  assert.notEqual(due.fingerprint,before.fingerprint); assert.equal(due.nextStepContactName,'Invented Student')
  assert.ok(!JSON.stringify(due).includes('Write a personal plan'))
  await save(c,id,'Rescheduled',tomorrow,1); assert.equal((await snapshot()).nextSteps,0)
  await root(()=>db.query("update follow_up_next_steps set due_at=now()-interval '1 minute' where id=$1",[id]))
  await record(id,c,randomUUID(),2); assert.equal((await snapshot()).nextSteps,0)
  for(const role of ['anon','authenticated','service_role']) assert.equal((await root(()=>db.query("select has_function_privilege($1,'private.follow_up_push_snapshot_before_next_steps()','EXECUTE') allowed",[role]))).rows[0].allowed,false)
})

test('migration rerun stops without modifying saved plans',async t=>{
  const {db,contact,save,list}=await setup(t)
  const id=await save(await contact())
  const text=await sql(migration)
  await db.exec('reset role')
  await assert.rejects(db.exec(text),/already exists/)
  await db.exec('rollback; set role authenticated')
  assert.equal((await list())[0].id,id)
})

test('stale prompt is named, personal, and suppressed while a chosen step is pending',async t=>{
  const {db,ids,root,rpc,contact,save}=await setup(t,true)
  const c=await contact()
  await root(()=>db.query('update follow_up_contacts set primary_owner_id=$1 where id=$2',[ids.user,c]))
  await root(()=>db.query("insert into follow_up_events(contact_id,performed_by,event_type,occurred_at) values($1,$2,'interaction',now()-interval '10 days')",[c,ids.user]))
  const snapshot=()=>root(async()=>(await db.query('select private.follow_up_push_snapshot() s')).rows[0].s)
  const initial=await snapshot()
  assert.equal(initial.staleContactId,c);assert.equal(initial.staleContactName,'Invented Student')
  const id=await save(c)
  assert.equal((await snapshot()).staleContactId,null)
  await rpc('follow_up_next_step_clear',[id,1])
  assert.equal((await snapshot()).staleContactId,c)
})

test('verification and recovery files run as complete files and preserve saved plans',async t=>{
  const {db,root,contact,save,list}=await setup(t,true)
  const id=await save(await contact())
  const read=name=>readFile(new URL(`../ready-to-run/personal-next-steps-${name}.sql`,import.meta.url),'utf8')
  for(const name of ['preflight','verify']) { const source=await read(name);await root(()=>db.exec(source)) }
  const source=await read('disable-push')
  await root(()=>db.exec(source));await root(()=>db.exec(source))
  assert.equal((await list())[0].id,id)
  const snapshot=await root(async()=>(await db.query('select private.follow_up_push_snapshot() s')).rows[0].s)
  assert.equal(snapshot.nextSteps,undefined)
})

 test('attention reminders name all categories and AI budget is owner-scoped', async t => {
  const f=await setup(t,true), c=await f.contact();
  await assert.rejects(f.rpc('follow_up_next_step_ai_claim',[c]), /assigned/);
  await f.root(()=>f.db.query('update follow_up_contacts set primary_owner_id=$1 where id=$2',[f.ids.user,c]));
  const snapshot=()=>f.root(async()=> (await f.db.query('select private.follow_up_push_snapshot() value')).rows[0].value);
  let value=await snapshot();
  assert.equal(value.attentionCategory,'awaiting'); assert.equal(value.attentionContactId,c);
  assert.equal(await f.rpc('follow_up_next_step_ai_claim',[c]),true);
  assert.equal(await f.rpc('follow_up_next_step_ai_claim',[c]),false);
  await f.root(()=>f.db.query("update follow_up_contacts set received_christ_at=now()-interval '2 days' where id=$1",[c]));
  value=await snapshot(); assert.equal(value.attentionCategory,'new-believers');
  await f.save(c); value=await snapshot(); assert.equal(value.attentionContactId,null); assert.equal(value.suppressContactReminder,true);
  await f.root(async()=>{const result=await f.db.query(await readFile(new URL('../ready-to-run/attention-next-steps-verify.sql',import.meta.url),'utf8'));assert.ok(Object.values(result.rows[0]).every(v=>v===true))});
  await assert.rejects(f.db.query('select * from private.follow_up_next_step_ai_requests'), /permission denied/);
  await f.asUser(f.ids.inactive); await assert.rejects(f.rpc('follow_up_next_step_ai_claim',[c]));
});
