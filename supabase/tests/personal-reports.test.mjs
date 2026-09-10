// All data is invented; no connection to a live Supabase project.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const { PGlite } = await import(process.env.FOLLOW_UP_PGLITE_MODULE || '@electric-sql/pglite')
const statsSql = await readFile(new URL('../migrations/20260910_my_stats.sql', import.meta.url), 'utf8')

const activitySql = await readFile(new URL('../migrations/20260910_my_activity.sql', import.meta.url), 'utf8')

test('personal reports isolate each user and honor reporting periods', async (t) => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table profiles(id uuid primary key,role text,is_active boolean default true);
    create table follow_up_campaigns(id uuid primary key,status text,created_at timestamptz default now());
    create table students(id uuid primary key,display_name text);
    create table follow_up_contacts(id uuid primary key,student_id uuid,campaign_id uuid,primary_owner_id uuid);
    create table follow_up_events(id uuid primary key default gen_random_uuid(),contact_id uuid,performed_by uuid,event_type text,occurred_at timestamptz,
      had_spiritual_conversation boolean default false,interview_completed boolean default false,kgp_shared boolean default false,
      received_christ boolean default false,invited_to_community_group boolean default false,notes text,text_purposes text[],text_event_name text,attachment_path text);
  `)
  await db.exec(statsSql); await db.exec(statsSql)
  await db.exec(activitySql); await db.exec(activitySql)
  const me=randomUUID(), other=randomUUID(), pending=randomUUID(), inactive=randomUUID(), campaign=randomUUID(), closed=randomUUID(), contact=randomUUID(), oldContact=randomUUID()
  await db.query("insert into profiles values($1,'staff',true),($2,'student_leader',true),($3,'pending',true),($4,'admin',false)",[me,other,pending,inactive])
  await db.query("insert into follow_up_campaigns(id,status) values($1,'active'),($2,'closed')",[campaign,closed])
  await db.query("insert into students values($1,'Example contact')",[contact])
  await db.query('insert into follow_up_contacts values($1,$1,$2,$3),($4,$1,$5,$3)',[contact,campaign,other,oldContact,closed])
  const asUser=id=>db.query("select set_config('test.user',$1,false)",[id??''])
  const stats=async(period='week')=>(await db.query('select get_my_personal_stats($1) result',[period])).rows[0].result
  const activity=async(period='week',offset=0)=>(await db.query('select get_my_personal_activity($1,$2) result',[period,offset])).rows[0].result
  const zero={has_campaign:true,knocks:0,text_attempts:0,interactions:0,spiritual_conversations:0,interviews_completed:0,kgp_shared:0,received_christ:0,cg_invitations:0}
  const event=async({who=me,type='interaction',age='0 hours',target=contact}={})=>(await db.query('insert into follow_up_events(contact_id,performed_by,event_type,occurred_at) values($1,$2,$3,now()-$4::interval) returning id',[target,who,type,age])).rows[0].id
  await asUser(me); assert.deepEqual(await stats(),zero)
  await db.exec('begin') // Exact boundary tests use stable now().
  const rich=await event({age:'1 hour'})
  await db.query('update follow_up_events set had_spiritual_conversation=true,interview_completed=true,kgp_shared=true,received_christ=true,invited_to_community_group=true where id=$1',[rich])
  await event({type:'knock'}); const text=await event({type:'text_attempt'})
  await db.query("update follow_up_events set text_purposes=array['invite_cg'] where id=$1",[text])
  await event({age:'168 hours'}); await event({age:'168 hours 1 second'}); await event({age:'720 hours'}); await event({age:'720 hours 1 second'})
  await event({age:'-1 second'}); await event({target:oldContact}); await event({who:other})
  await t.test('only own work in active campaign, independent of current contact owner',async()=>{
    assert.deepEqual(await stats(),{...zero,knocks:1,text_attempts:1,interactions:2,spiritual_conversations:1,interviews_completed:1,kgp_shared:1,received_christ:1,cg_invitations:1})
    assert.equal((await stats('month')).interactions,4)
    assert.equal((await stats('campaign')).interactions,5)
    await asUser(other); assert.deepEqual(await stats(),{...zero,interactions:1}); await asUser(me)
  })
  async function rejectsInTransaction(fn, pattern) {
    await db.exec('savepoint expected_rejection')
    try { await assert.rejects(fn, pattern) } finally { await db.exec('rollback to savepoint expected_rejection; release savepoint expected_rejection') }
  }
  await t.test('every approved role can access its own work; unapproved users and invalid ranges are rejected',async()=>{
    for(const role of ['student_leader','discipler','staff','admin']) {
      await db.query('update profiles set role=$1 where id=$2',[role,me]); assert.equal((await stats()).interactions,2); assert.equal((await activity()).activity.length,4)
    }
    for(const person of [pending,inactive,null]) {
      await asUser(person)
      await rejectsInTransaction(stats, /signed in|Active Follow Up access/)
      await rejectsInTransaction(activity, /signed in|Active Follow Up access/)
    }
    await asUser(me)
    for(const period of [null,'other']) {
      await rejectsInTransaction(()=>stats(period), /Invalid reporting period/)
      await rejectsInTransaction(()=>activity(period), /Invalid reporting period/)
    }
  })
  await t.test('history matches stats periods, includes notes/text/photo indicators, and paginates without duplicates',async()=>{
    assert.equal((await activity()).activity.length,4)
    assert.equal((await activity('month')).activity.length,6)
    assert.equal((await activity('campaign')).activity.length,7)
    await db.query("update follow_up_events set notes='Example notes',attachment_path='private/example.jpg' where id=$1",[rich])
    const entries=(await activity()).activity
    assert.equal(entries.find(e=>e.id===rich).notes,'Example notes')
    assert.equal(entries.find(e=>e.id===rich).has_photo,true)
    assert.equal(entries.find(e=>e.id===rich).attachment_path,undefined)
    assert.deepEqual(entries.find(e=>e.id===text).text_purposes,['invite_cg'])
    await db.exec('savepoint pagination')
    for(let i=0;i<28;i++) await event({type:'knock',age:'2 hours'})
    const first=await activity(), second=await activity('week',25)
    assert.equal(first.activity.length,25); assert.equal(first.has_more,true)
    assert.equal(second.activity.length,7); assert.equal(second.has_more,false)
    assert.equal(new Set([...first.activity,...second.activity].map(e=>e.id)).size,32)
    assert.deepEqual(await activity(),first) // Equal timestamps use the event ID as a stable tie breaker.
    assert.deepEqual(await activity('week',-5),first)
    assert.equal((await activity('week',100)).activity.length,0)
    await db.exec('rollback to savepoint pagination; release savepoint pagination')
  })
  await t.test('editing/deleting events changes stats, and texts never count as interaction invitations',async()=>{
    await db.query('update follow_up_events set kgp_shared=false where id=$1',[rich]); assert.equal((await stats()).kgp_shared,0)
    await db.query('delete from follow_up_events where id=$1',[rich]); assert.equal((await stats()).cg_invitations,0)
    assert(!(await activity()).activity.some(e=>e.id===rich))
    assert.equal((await stats()).text_attempts,1)
    await db.query("update follow_up_campaigns set status='closed' where id=$1",[campaign]); assert.deepEqual(await stats(),{...zero,has_campaign:false})
    assert.deepEqual(await activity(),{has_campaign:false,has_more:false,activity:[]})
    await db.query("update follow_up_campaigns set status='active' where id=$1",[campaign])
  })
  await db.exec('commit')
  const rights=(await db.query("select has_function_privilege('anon','public.get_my_personal_stats(text)','EXECUTE') a,has_function_privilege('authenticated','public.get_my_personal_stats(text)','EXECUTE') b,has_function_privilege('authenticated','private.my_personal_report_context(text)','EXECUTE') c")).rows[0]
  assert.deepEqual(rights,{a:false,b:true,c:false})
  const activityRights=(await db.query("select has_function_privilege('anon','public.get_my_personal_activity(text,integer)','EXECUTE') a,has_function_privilege('authenticated','public.get_my_personal_activity(text,integer)','EXECUTE') b")).rows[0]
  assert.deepEqual(activityRights,{a:false,b:true})
})
