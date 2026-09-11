import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const { PGlite } = await import(process.env.FOLLOW_UP_PGLITE_MODULE || '@electric-sql/pglite')
const sql = await readFile(new URL('../migrations/20260911_cg_text_invite_only.sql', import.meta.url), 'utf8')

test('CG-only no-knock preference saves independently and guards only CG knocks', async (t) => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`create role authenticated; create role anon; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table profiles(id uuid primary key,role text,is_active boolean);
    create table follow_up_campaigns(id uuid primary key,status text);
    create table follow_up_contacts(id uuid primary key,campaign_id uuid,status text,primary_owner_id uuid,knock_count integer default 0);
    -- Spy for the existing knock function. The migration must leave it untouched.
    create function public.log_knock(p_contact_id uuid) returns void language sql as $$update public.follow_up_contacts set knock_count=knock_count+1 where id=p_contact_id$$;
  `)
  const actor=randomUUID(), other=randomUUID(), campaign=randomUUID(), closed=randomUUID(), contact=randomUUID(), oldContact=randomUUID()
  await db.query("insert into profiles values($1,'staff',true),($2,'student_leader',true)",[actor,other])
  await db.query("insert into follow_up_campaigns values($1,'active'),($2,'closed')",[campaign,closed])
  await db.query("insert into follow_up_contacts(id,campaign_id,status,primary_owner_id) values($1,$2,'go_back',$3),($4,$5,'uncontacted',$3)",[contact,campaign,other,oldContact,closed])
  await db.exec(sql); await db.exec(sql)
  const asUser=id=>db.query("select set_config('test.user',$1,false)",[id??''])
  const row=async()=>(await db.query('select * from follow_up_contacts where id=$1',[contact])).rows[0]
  const save=(enabled,id=contact)=>db.query('select set_contact_cg_text_invite_only($1,$2)',[id,enabled])
  const knock=(id=contact)=>db.query('select log_cg_invitation_knock($1)',[id])
  await asUser(actor)
  assert.equal((await row()).cg_text_invite_only,false)
  const before=await row()
  for(const role of ['student_leader','discipler','staff','admin']) {
    await db.query('update profiles set role=$1 where id=$2',[role,actor])
    await save(true); assert.equal((await row()).cg_text_invite_only,true)
    await assert.rejects(knock,/text invitations only/)
    await save(false); assert.equal((await row()).cg_text_invite_only,false)
  }
  assert.deepEqual(await row(),before) // Status, primary, and counts remain untouched.
  await knock(); assert.equal((await row()).knock_count,1)
  await save(true)
  await assert.rejects(knock,/text invitations only/) // A stale enabled CG form is blocked too.
  await db.query('select log_knock($1)',[contact]); assert.equal((await row()).knock_count,2) // Other views retain ordinary logging.
  await save(false); await knock(); assert.equal((await row()).knock_count,3)
  await assert.rejects(()=>save(null),/Choose whether/)
  for(const id of [oldContact,randomUUID()]) {
    await assert.rejects(()=>save(true,id),/active Follow Up campaign/)
    await assert.rejects(()=>knock(id),/active Follow Up campaign/)
  }
  await db.query("update profiles set role='pending' where id=$1",[actor])
  await assert.rejects(()=>save(true),/Active Follow Up access/); await assert.rejects(knock,/Active Follow Up access/)
  await db.query("update profiles set role='staff',is_active=false where id=$1",[actor])
  await assert.rejects(()=>save(true),/Active Follow Up access/); await assert.rejects(knock,/Active Follow Up access/)
  await asUser(null)
  await assert.rejects(()=>save(true),/signed in/); await assert.rejects(knock,/signed in/)
  const permissions=(await db.query("select has_function_privilege('anon','set_contact_cg_text_invite_only(uuid,boolean)','EXECUTE') a,has_function_privilege('authenticated','set_contact_cg_text_invite_only(uuid,boolean)','EXECUTE') b,has_function_privilege('anon','log_cg_invitation_knock(uuid)','EXECUTE') c")).rows[0]
  assert.deepEqual(permissions,{a:false,b:true,c:false})
})
