// In-memory PostgreSQL only: all names, IDs, and activity below are invented.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const { PGlite } = await import(process.env.FOLLOW_UP_PGLITE_MODULE || '@electric-sql/pglite')
const sql = await readFile(new URL('../migrations/20260910_staff_handoffs_and_assignment_attention.sql', import.meta.url), 'utf8')

test('staff handoffs, personal coaching, and owner-specific attention', async (t) => {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`
    create role authenticated; create role anon; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table profiles(id uuid primary key,display_name text,email text,role text,is_active boolean default true);
    create table follow_up_campaigns(id uuid primary key,status text,created_at timestamptz default now());
    create table ministry_areas(id uuid primary key,name text,area_type text,parent_id uuid,is_active boolean default true);
    create table profile_ministry_area_assignments(profile_id uuid,campaign_id uuid,ministry_area_id uuid,is_default boolean default true,created_at timestamptz default now());
    create table discipleship_relationships(disciple_id uuid,discipler_id uuid,campaign_id uuid,is_current boolean default true,ended_at timestamptz);
    create table students(id uuid primary key,display_name text,uniqname text);
    create table follow_up_contacts(id uuid primary key,student_id uuid,campaign_id uuid,primary_owner_id uuid,status text default 'uncontacted',
      ministry_location_id uuid,house_name text,room_or_address text,location_resolution text,raw_location_text text,
      jesus_interest text,community_interest text,interview_interest text,received_christ_at timestamptz,
      coaching_correction_exempt_owner_id uuid,coaching_correction_exempt_at timestamptz,updated_at timestamptz default now());
    create table follow_up_contact_affinities(contact_id uuid,ministry_area_id uuid);
    create table follow_up_events(id uuid default gen_random_uuid(),contact_id uuid,event_type text,performed_by uuid,occurred_at timestamptz default now(),
      had_spiritual_conversation boolean default false,interview_completed boolean default false,kgp_shared boolean default false,received_christ boolean default false,notes text);
    -- Existing owner/status trigger supplied by the user: confirm coexistence.
    create function private.clear_follow_up_coaching_correction_on_owner_change() returns trigger language plpgsql as $$begin
      if new.primary_owner_id is distinct from old.primary_owner_id or (new.status is distinct from old.status and new.status <> 'uncontacted') then
        new.coaching_correction_exempt_owner_id:=null; new.coaching_correction_exempt_at:=null; end if; return new; end$$;
    create trigger follow_up_clear_coaching_correction_on_owner_change before update of primary_owner_id,status on follow_up_contacts
      for each row execute function private.clear_follow_up_coaching_correction_on_owner_change();
  `)
  const admin=randomUUID(), staff=randomUUID(), recipient=randomUUID(), adminDisciple=randomUUID(), discipler=randomUUID(), student=randomUUID(), outsider=randomUUID(), inactive=randomUUID(), pending=randomUUID()
  const campaign=randomUUID(), closed=randomUUID(), north=randomUUID(), central=randomUUID()
  for (const [id,role,name] of [[admin,'admin','Team leader'],[staff,'staff','North staff'],[recipient,'staff','Central staff'],[adminDisciple,'admin','Admin disciple'],[discipler,'discipler','Discipler'],[student,'student_leader','Student'],[outsider,'student_leader','Outside student'],[inactive,'staff','Inactive'],[pending,'pending','Pending']])
    await db.query('insert into profiles(id,role,display_name,is_active) values($1,$2,$3,$4)',[id,role,name,id!==inactive])
  await db.query("insert into follow_up_campaigns(id,status) values($1,'active'),($2,'closed')",[campaign,closed])
  await db.query("insert into ministry_areas(id,name,area_type) values($1,'North','campus_region'),($2,'Central','campus_region')",[north,central])
  for(const [person,area] of [[staff,north],[recipient,central],[discipler,north],[student,north],[outsider,central]])
    await db.query('insert into profile_ministry_area_assignments(profile_id,campaign_id,ministry_area_id) values($1,$2,$3)',[person,campaign,area])
  for(const [parent,child] of [[admin,staff],[admin,adminDisciple],[admin,discipler],[staff,student],[discipler,student],[staff,recipient],[recipient,outsider]])
    await db.query('insert into discipleship_relationships(discipler_id,disciple_id,campaign_id) values($1,$2,$3)',[parent,child,campaign])
  const asUser = id => db.query("select set_config('test.user',$1,false)",[id ?? ''])
  const rpc = async (name,args=[],placeholders=args.map((_,i)=>`$${i+1}`).join(',')) => (await db.query(`select ${name}(${placeholders}) as result`,args)).rows[0].result
  const row = async id => (await db.query('select * from follow_up_contacts where id=$1',[id])).rows[0]
  const makeContact = async ({owner=null,area=north,camp=campaign,status='uncontacted'}={}) => {
    const id=randomUUID(); await db.query('insert into students(id,display_name) values($1,$2)',[id,'Example '+id.slice(0,6)])
    await db.query('insert into follow_up_contacts(id,student_id,campaign_id,primary_owner_id,ministry_location_id,status) values($1,$1,$2,$3,$4,$5)',[id,camp,owner,area,status]); return id
  }
  const event = async (contact,person,type='interaction',age='0 seconds') => (await db.query("insert into follow_up_events(contact_id,performed_by,event_type,occurred_at) values($1,$2,$3,now()-$4::interval) returning id",[contact,person,type,age])).rows[0].id
  const legacy = await makeContact({owner:recipient})
  const legacySeen = await makeContact({owner:recipient})
  await event(legacySeen,recipient,'interaction','1 day')
  await db.exec(sql)
  await db.exec(sql) // Safe to rerun the exact complete migration.
  await asUser(staff)
  const handoff=await makeContact({owner:staff,area:central,status:'go_back'})
  await event(handoff,staff,'interaction','1 hour')
  const preassignment=await event(handoff,recipient,'interaction','2 hours')

  await t.test('cross-area staff/admin handoffs preserve status/history and ordinary restrictions',async()=>{
    const choices=await rpc('get_contact_primary_choices',[handoff])
    assert(choices.some(p=>p.id===recipient&&p.group==='staff'))
    assert(choices.some(p=>p.id===admin&&p.group==='staff'))
    assert(!choices.some(p=>[inactive,pending,student].includes(p.id))) // Outside actor's area: no ordinary disciples.
    await rpc('assign_contacts_to_follow_up_user',[[handoff],recipient])
    assert.equal((await row(handoff)).primary_owner_id,recipient)
    assert.equal((await row(handoff)).status,'go_back')
    assert.equal((await db.query('select count(*)::int n from follow_up_events where contact_id=$1',[handoff])).rows[0].n,2)
    assert((await row(handoff)).primary_assigned_at)
    const workspace=await rpc('get_contact_assignment_workspace')
    assert(workspace.assignees.some(p=>p.id===recipient))
    assert(!workspace.contacts.some(c=>c.id===handoff)) // Do not broaden the general contact pool.
    const local=await makeContact()
    const ownChoices=await rpc('get_contact_primary_choices',[local])
    assert(ownChoices.some(p=>p.id===student&&p.group==='disciples'))
    await rpc('assign_contacts_to_follow_up_user',[[local],student])
    await assert.rejects(rpc('assign_contacts_to_follow_up_user',[[local],outsider]),/Staff can assign/)
    await assert.rejects(rpc('assign_contacts_to_follow_up_user',[[handoff],student]),/outside your Staff/)
    for(const target of [inactive,pending]) await assert.rejects(rpc('assign_contacts_to_follow_up_user',[[local],target]))
    const closedContact=await makeContact({camp:closed}), uninterested=await makeContact({status:'not_interested'})
    await assert.rejects(rpc('assign_contacts_to_follow_up_user',[[local,closedContact],recipient]),/eligible contacts/)
    assert.equal((await row(local)).primary_owner_id,student) // All or nothing.
    await assert.rejects(rpc('assign_contacts_to_follow_up_user',[[uninterested],recipient]),/eligible contacts/)
    await assert.rejects(rpc('assign_contacts_to_follow_up_user',[[null],recipient]),/eligible contacts/)
    await asUser(discipler)
    assert(!(await rpc('get_contact_primary_choices',[local])).some(p=>p.group==='staff'))
    await assert.rejects(rpc('assign_contacts_to_follow_up_user',[[local],recipient]))
    const ordinary=await makeContact(); await rpc('assign_contacts_to_follow_up_user',[[ordinary],student])
    for(const person of [student,inactive,pending,null]) {
      await asUser(person); await assert.rejects(rpc('assign_contacts_to_follow_up_user',[[local],recipient]))
      await assert.rejects(rpc('get_contact_primary_choices',[local]))
    }
    await asUser(admin)
    await rpc('assign_contacts_to_follow_up_user',[[local],staff])
    assert.equal((await row(local)).primary_owner_id,staff)
  })

  await t.test('attention tracks the new owner after assignment, with legacy fallback and matching lists',async()=>{
    await asUser(recipient)
    const list=()=>rpc('get_my_contact_attention_list',['awaiting'])
    const ids=async()=>new Set((await list()).contacts.map(c=>c.id))
    assert((await ids()).has(handoff)); assert((await ids()).has(legacy)); assert(!(await ids()).has(legacySeen))
    assert.equal((await row(legacy)).primary_assigned_at,null)
    assert.equal((await rpc('get_my_contact_attention')).unattempted,(await list()).total)
    const stamp=(await row(handoff)).primary_assigned_at
    await db.query("update follow_up_contacts set house_name='Example house',primary_assigned_at=now()-interval '1 year' where id=$1",[handoff])
    assert.deepEqual((await row(handoff)).primary_assigned_at,stamp)
    await event(handoff,recipient,'knock'); await event(handoff,recipient,'text_attempt'); await event(handoff,staff)
    assert((await ids()).has(handoff))
    const newEvent=await event(handoff,recipient)
    assert(!(await ids()).has(handoff))
    await db.query('delete from follow_up_events where id=$1',[newEvent]); assert((await ids()).has(handoff))
    await db.query('delete from follow_up_events where id=$1',[preassignment]); assert((await ids()).has(handoff))
    await asUser(staff); await rpc('assign_contacts_to_follow_up_user',[[handoff],recipient]); // Same owner: no reset.
    assert.deepEqual((await row(handoff)).primary_assigned_at,stamp)
    await asUser(admin); await rpc('assign_contacts_to_follow_up_user',[[handoff],staff]);
    await asUser(recipient); assert(!(await ids()).has(handoff))
    await asUser(staff); await rpc('assign_contacts_to_follow_up_user',[[handoff],recipient]);
    assert(new Date((await row(handoff)).primary_assigned_at)>new Date(stamp))
    await asUser(recipient); assert((await ids()).has(handoff))
    await db.query('update follow_up_contacts set primary_owner_id=null where id=$1',[handoff])
    assert.equal((await row(handoff)).primary_assigned_at,null); assert(!(await ids()).has(handoff))
    await assert.rejects(rpc('get_my_contact_attention_list',['bad category']),/Invalid attention/)
    for(const person of [inactive,pending,null]) {
      await asUser(person); await assert.rejects(rpc('get_my_contact_attention'));
      await assert.rejects(list())
    }
  })

  await t.test('staff/admin disciples show only personal totals and require a direct relationship',async()=>{
    const staffContact=await makeContact({owner:staff}), childContact=await makeContact({owner:student}), adminContact=await makeContact({owner:adminDisciple})
    await event(staffContact,staff); await event(childContact,student); await event(adminContact,adminDisciple)
    await asUser(admin)
    const dashboard=(await db.query('select * from get_my_disciples_dashboard()')).rows
    const staffRow=dashboard.find(p=>p.disciple_id===staff)
    assert.equal(Number(staffRow.chain_descendant_count),0); assert.equal(Number(staffRow.direct_disciple_count),0)
    const ownEvents=(await db.query("select count(*) n from follow_up_events where performed_by=$1 and event_type='interaction' and occurred_at>=date_trunc('week',now() at time zone 'America/Detroit') at time zone 'America/Detroit'",[staff])).rows[0].n
    assert.equal(Number(staffRow.week_interactions),Number(ownEvents))
    const detail=await rpc('get_disciple_coaching_detail',[staff])
    assert.equal(detail.metrics.chain_people,1); assert.deepEqual(detail.direct_disciples,[])
    assert.equal(detail.metrics.week_interactions,Number(ownEvents))
    assert(detail.recent_activity.every(e=>e.performer_id===staff))
    const adminDetail=await rpc('get_disciple_coaching_detail',[adminDisciple])
    assert.equal(adminDetail.metrics.chain_people,1); assert.equal(adminDetail.metrics.week_interactions,1)
    const ordinary=await rpc('get_disciple_coaching_detail',[discipler])
    assert.equal(ordinary.metrics.chain_people,2); assert(ordinary.direct_disciples.some(p=>p.id===student))
    await assert.rejects(rpc('get_disciple_coaching_detail',[recipient]),/not in your discipleship chain/)
    await asUser(staff); assert.equal((await rpc('get_disciple_coaching_detail',[recipient])).metrics.chain_people,1)
    await asUser(discipler); await assert.rejects(rpc('get_disciple_coaching_detail',[staff]),/not in your discipleship chain/)
  })

  await t.test('attention keeps existing stale/new-believer boundaries and deduplicates overlap',async()=>{
    const isolated=randomUUID(); await db.query("insert into profiles(id,role,display_name) values($1,'student_leader','Isolated')",[isolated]); await asUser(isolated)
    await db.exec('begin') // Stable now() for exact thresholds.
    const overlap=await makeContact({owner:isolated,status:'go_back'})
    await db.query("update follow_up_contacts set received_christ_at=now()-interval '7 days' where id=$1",[overlap])
    await event(overlap,staff,'interaction','7 days')
    assert.deepEqual(await rpc('get_my_contact_attention'),{unattempted:1,staleGoBacks:1,newBelievers:1,total:1})
    for(const category of ['awaiting','stale','new-believers']) assert.equal((await rpc('get_my_contact_attention_list',[category])).total,1)
    await event(overlap,isolated)
    assert.deepEqual(await rpc('get_my_contact_attention'),{unattempted:0,staleGoBacks:0,newBelievers:0,total:0})
    await db.exec('commit')
    const rights=(await db.query("select has_function_privilege('anon','public.get_my_contact_attention_list(text,integer)','EXECUTE') a,has_function_privilege('authenticated','public.get_my_contact_attention_list(text,integer)','EXECUTE') b,has_function_privilege('authenticated','private.my_contact_attention_rows()','EXECUTE') c")).rows[0]
    assert.deepEqual(rights,{a:false,b:true,c:false})
  })
})
