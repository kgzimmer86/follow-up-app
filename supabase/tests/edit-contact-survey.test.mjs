// In-memory PostgreSQL with invented data only.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const { PGlite } = await import(process.env.FOLLOW_UP_PGLITE_MODULE || '@electric-sql/pglite')
const sql = await readFile(new URL('../migrations/20260911_edit_contact_survey.sql', import.meta.url), 'utf8')

test('survey edits enforce per-field roles and preserve unrelated contact data',async(t)=>{
  const db=new PGlite(); t.after(()=>db.close())
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table profiles(id uuid primary key,role text,is_active boolean);
    create table follow_up_campaigns(id uuid primary key,status text);
    create table ministry_areas(id uuid primary key,area_type text,is_active boolean);
    create table follow_up_contacts(id uuid primary key,campaign_id uuid,status text,primary_owner_id uuid,
      jesus_interest text,community_interest text,interview_interest text,gender_raw text,year_at_um text,house_name text,
      kgp_shared_at timestamptz,cg_text_invite_only boolean default false);
    create table follow_up_contact_affinities(contact_id uuid,ministry_area_id uuid,created_at timestamptz default now(),primary key(contact_id,ministry_area_id));
    alter table follow_up_contacts enable row level security;
    -- Match the supplied read-only contact policy; no new direct-update policy is added.
    create policy contacts_read on follow_up_contacts for select to authenticated using(true);
    grant select,update on follow_up_contacts to authenticated;
  `)
  const actor=randomUUID(),owner=randomUUID(),campaign=randomUUID(),closed=randomUUID(),contact=randomUUID(),oldContact=randomUUID(),a=randomUUID(),b=randomUUID(),inactive=randomUUID(),dorm=randomUUID()
  await db.query("insert into profiles values($1,'student_leader',true)",[actor])
  await db.query("insert into follow_up_campaigns values($1,'active'),($2,'closed')",[campaign,closed])
  await db.query("insert into ministry_areas values($1,'affinity',true),($2,'affinity',true),($3,'affinity',false),($4,'dorm',true)",[a,b,inactive,dorm])
  await db.query("insert into follow_up_contacts values($1,$2,'go_back',$3,'maybe','no','yes','Male','Freshman','Example house',now(),true),($4,$5,'uncontacted',$3,null,null,null,null,null,null,null,false)",[contact,campaign,owner,oldContact,closed])
  await db.exec(`alter table follow_up_contacts add column interview_completed_at timestamptz, add column survey_submitted_at timestamptz, add column received_christ_at timestamptz;
    create table follow_up_events(contact_id uuid,invited_to_community_group boolean,notes text);`)
  await db.query("update follow_up_contacts set interview_completed_at=now(),survey_submitted_at=now()-interval '7 days',received_christ_at=now() where id=$1",[contact])
  await db.query("insert into follow_up_events values($1,true,'Original interaction')",[contact])
  await db.exec(sql);await db.exec(sql)
  await db.query("select set_config('test.user',$1,false)",[actor])
  const row=async()=>(await db.query('select * from follow_up_contacts where id=$1',[contact])).rows[0]
  const edit=(field,value,id=contact)=>db.query('select set_contact_survey_field($1,$2,$3)',[id,field,value])
  const affinities=(ids,id=contact)=>db.query('select set_contact_survey_affinities($1,$2)',[id,ids])
  const original=await row()
  const staffFields={jesus_interest:'already_have_one',interview_interest:'no',gender_raw:'Female',year_at_um:'Sophomore',house_name:'New house'}
  await t.test('student leaders and disciplers may edit only community, including clearing an answer',async()=>{
    for(const role of ['student_leader','discipler']) {
      await db.query('update profiles set role=$1 where id=$2',[role,actor])
      for(const answer of ['yes','maybe','no',null]) {await edit('community_interest',answer);assert.equal((await row()).community_interest,answer)}
      for(const [field,value] of Object.entries(staffFields)) await assert.rejects(()=>edit(field,value),/Staff or Admin/)
      await assert.rejects(()=>affinities([a]),/Staff or Admin/)
    }
    assert.deepEqual(await row(),{...original,community_interest:null})
    await db.exec('set role authenticated')
    await db.query("update follow_up_contacts set jesus_interest='yes' where id=$1",[contact])
    await edit('community_interest','yes') // Approved setter works despite no direct update policy.
    await db.exec('reset role')
    assert.equal((await row()).jesus_interest,'maybe')
  })
  await t.test('staff/admin can edit every requested field without changing status, ownership, or progress',async()=>{
    for(const role of ['staff','admin']) {
      await db.query('update profiles set role=$1 where id=$2',[role,actor])
      for(const [field,value] of Object.entries(staffFields)) {await edit(field,value);assert.equal((await row())[field],value)}
    }
    for(const key of ['status','primary_owner_id','kgp_shared_at','interview_completed_at','survey_submitted_at','received_christ_at','cg_text_invite_only']) assert.deepEqual((await row())[key],original[key])
    assert.deepEqual((await db.query('select * from follow_up_events')).rows,[{contact_id:contact,invited_to_community_group:true,notes:'Original interaction'}])
    await edit('house_name','  ');assert.equal((await row()).house_name,null)
    for(const [field,value] of [['jesus_interest','invalid'],['community_interest','already_have_one'],['interview_interest','already_have_one'],['status','involved'],['house_name','x'.repeat(201)],[null,'yes']]) await assert.rejects(()=>edit(field,value))
  })
  await t.test('affinity edits are atomic, preserve retained timestamps/inactive history, and reject dorms',async()=>{
    await db.query("insert into follow_up_contact_affinities values($1,$2,now()-interval '1 day'),($1,$3,now()-interval '2 days')",[contact,a,inactive])
    const existing=(await db.query('select created_at from follow_up_contact_affinities where contact_id=$1 and ministry_area_id=$2',[contact,a])).rows[0].created_at
    await affinities([a,b,b])
    assert.equal((await db.query('select count(*)::int n from follow_up_contact_affinities where contact_id=$1',[contact])).rows[0].n,3)
    assert.deepEqual((await db.query('select created_at from follow_up_contact_affinities where contact_id=$1 and ministry_area_id=$2',[contact,a])).rows[0].created_at,existing)
    for(const ids of [[dorm],[inactive],[null],[randomUUID()],null]) await assert.rejects(()=>affinities(ids))
    assert.equal((await db.query('select count(*)::int n from follow_up_contact_affinities where contact_id=$1',[contact])).rows[0].n,3)
    await affinities([])
    assert.deepEqual((await db.query('select ministry_area_id from follow_up_contact_affinities where contact_id=$1',[contact])).rows,[{ministry_area_id:inactive}])
  })
  await t.test('inactive campaigns, unknown contacts, pending, inactive, and signed-out users cannot edit',async()=>{
    for(const id of [oldContact,randomUUID()]) {
      await assert.rejects(()=>edit('community_interest','yes',id),/active Follow Up campaign/)
      await assert.rejects(()=>affinities([a],id),/active Follow Up campaign/)
    }
    for(const [role,active] of [['pending',true],['admin',false]]) {
      await db.query('update profiles set role=$1,is_active=$2 where id=$3',[role,active,actor])
      await assert.rejects(()=>edit('community_interest','yes'));await assert.rejects(()=>affinities([a]))
    }
    await db.query("select set_config('test.user','',false)")
    await assert.rejects(()=>edit('community_interest','yes'),/signed in/);await assert.rejects(()=>affinities([a]),/signed in/)
    const rights=(await db.query("select has_function_privilege('anon','set_contact_survey_field(uuid,text,text)','EXECUTE') a,has_function_privilege('authenticated','set_contact_survey_field(uuid,text,text)','EXECUTE') b,has_function_privilege('anon','set_contact_survey_affinities(uuid,uuid[])','EXECUTE') c")).rows[0]
    assert.deepEqual(rights,{a:false,b:true,c:false})
  })
})
