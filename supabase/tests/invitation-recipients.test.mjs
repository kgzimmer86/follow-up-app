import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('recipient choices combine the full current disciple chain and default area descendants, respecting roles', async t => {
  const db = new PGlite(); t.after(() => db.close())
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema private;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table profiles(id uuid primary key,display_name text,role text,is_active boolean default true);
    create table follow_up_campaigns(id uuid primary key,status text);
    create table ministry_areas(id uuid primary key,parent_id uuid);
    create table profile_ministry_area_assignments(profile_id uuid,campaign_id uuid,ministry_area_id uuid,is_default boolean);
    create table discipleship_relationships(discipler_id uuid,disciple_id uuid,campaign_id uuid,is_current boolean,ended_at timestamptz);
    create function private.invitation_user_role() returns text language plpgsql as $$declare r text; begin
      select role into r from public.profiles where id=auth.uid() and is_active and role in ('staff','admin','discipler','student_leader');
      if r is null then raise exception 'Active access required'; end if; return r; end;$$;`)
  await db.exec(await readFile(new URL('../migrations/20260916_invitation_recipient_choices.sql', import.meta.url),'utf8'))
  const keys = ['campaign','oldCampaign','root','child','elsewhere','viewer','direct','second','third','local','historical','ended','oldDisciple','inactive','pending','staff']
  const id = Object.fromEntries(keys.map(k => [k,randomUUID()]))
  await db.query("insert into follow_up_campaigns values($1,'active'),($2,'archived')",[id.campaign,id.oldCampaign])
  await db.query('insert into ministry_areas values($1,null),($2,$1),($3,null)',[id.root,id.child,id.elsewhere])
  for (const name of keys.slice(5)) await db.query('insert into profiles values($1,$2,$3,$4)',[id[name],name,name==='viewer'?'admin':name==='staff'?'staff':name==='pending'?'pending':'student_leader',name!=='inactive'])
  for (const name of keys.slice(5)) await db.query('insert into profile_ministry_area_assignments values($1,$2,$3,true)',[id[name],id.campaign,name==='viewer'?id.root:['local','inactive','pending','staff'].includes(name)?id.child:id.elsewhere])
  await db.query('insert into profile_ministry_area_assignments values($1,$2,$3,false)',[id.historical,id.campaign,id.child])
  for (const [parent,child,current,campaign] of [['viewer','direct',true,'campaign'],['direct','second',true,'campaign'],['second','third',true,'campaign'],['viewer','ended',false,'campaign'],['viewer','oldDisciple',true,'oldCampaign']])
    await db.query('insert into discipleship_relationships values($1,$2,$3,$4,null)',[id[parent],id[child],id[campaign],current])
  const asUser = user => db.query("select set_config('test.user',$1,false)",[user])
  const names = async () => (await db.query('select display_name from community_invitation_recipients($1)',[id.campaign])).rows.map(r=>r.display_name).sort()
  await asUser(id.viewer)
  assert.deepEqual(await names(),['direct','local','second','staff','third','viewer'])
  await db.query('insert into discipleship_relationships values($1,$2,$3,true,null)',[id.third,id.direct,id.campaign])
  assert.deepEqual(await names(),['direct','local','second','staff','third','viewer'],'cycles terminate without duplicate choices')
  await db.query("update profiles set role='discipler' where id=$1",[id.viewer])
  assert.deepEqual(await names(),['direct','local','second','third','viewer'])
  await asUser(id.local); assert.deepEqual(await names(),['local'])
  await asUser(id.viewer)
  await db.query('delete from profile_ministry_area_assignments where profile_id=$1',[id.viewer])
  assert.ok((await names()).includes('third'),'no default means All Campus')
  assert.ok(!(await names()).includes('inactive'))
  assert.deepEqual((await db.query('select * from community_invitation_recipients($1)',[id.oldCampaign])).rows,[])
  await asUser(id.pending); await assert.rejects(names(),/Active access/)
  await db.exec('set role anon'); await assert.rejects(names(),/permission denied/)
})
