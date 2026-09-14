import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'

test('celebrations publish first names only after successful saves, once per account and student', async t => {
  const db=new PGlite(); t.after(()=>db.close())
  await db.exec(`create role anon; create role authenticated; create schema private; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create table profiles(id uuid primary key,is_active boolean,role text);
    create table students(id uuid primary key,display_name text);
    create table follow_up_campaigns(id uuid primary key,status text);
    create table follow_up_contacts(id uuid primary key,student_id uuid,campaign_id uuid);
    create table follow_up_events(id uuid primary key,contact_id uuid,performed_by uuid,event_type text,received_christ boolean);`)
  const a=randomUUID(),b=randomUUID(),s=randomUUID(),c=randomUUID(),campaign=randomUUID()
  await db.query("insert into profiles values($1,true,'admin'),($2,true,'student_leader')",[a,b])
  await db.query("insert into students values($1,'Alex PrivateSurname')",[s])
  await db.query("insert into follow_up_campaigns values($1,'active')",[campaign])
  await db.query('insert into follow_up_contacts values($1,$2,$3)',[c,s,campaign])
  await db.exec(await readFile(new URL('../migrations/20260917_received_christ_celebrations.sql',import.meta.url),'utf8'))
  const take=async user=>{await db.query("select set_config('test.user',$1,false)",[user]);return (await db.query('select take_received_christ_celebration() r')).rows[0].r}
  assert.equal(await take(a),null)
  await db.exec('begin')
  await db.query("insert into follow_up_events values($1,$2,$3,'interaction',true)",[randomUUID(),c,a])
  await db.exec('rollback'); assert.equal(await take(a),null)
  const event=randomUUID()
  await db.query("insert into follow_up_events values($1,$2,$3,'interaction',true)",[event,c,a])
  const item=await take(a); assert.equal(item.firstName,'Alex'); assert.deepEqual(Object.keys(item).sort(),['firstName','id'])
  assert.equal(await take(a),null); assert.deepEqual(await take(b),item)
  await db.query("insert into follow_up_events values($1,$2,$3,'interaction',true)",[randomUUID(),c,a])
  assert.equal(await take(a),null,'repeated checkbox is not another conversion')
  await db.query('update profiles set is_active=false where id=$1',[b]); await assert.rejects(take(b),/Active/)
  await db.exec('set role authenticated'); await assert.rejects(db.query('select * from private.received_christ_celebrations'),/permission denied/)
  await db.exec('reset role; set role anon'); await assert.rejects(db.query('select take_received_christ_celebration()'),/permission denied/)
})
