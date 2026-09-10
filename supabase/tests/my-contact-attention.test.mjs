import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const { PGlite } = await import(process.env.FOLLOW_UP_PGLITE_MODULE || '@electric-sql/pglite')
const sql = await readFile(new URL('../migrations/20260909_my_contact_attention.sql', import.meta.url), 'utf8')

test('personal attention counts respect ownership, time thresholds, interactions and unique totals', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
      create table profiles(id uuid, is_active boolean, role text);
      create table follow_up_campaigns(id uuid,status text);
      create table follow_up_contacts(id uuid, campaign_id uuid,primary_owner_id uuid,status text,received_christ_at timestamptz);
      create table follow_up_events(contact_id uuid,event_type text,occurred_at timestamptz);`)
    await db.exec(sql)
    await db.exec(sql)
    const user = randomUUID(), other = randomUUID(), campaign = randomUUID(), old = randomUUID()
    await db.query("insert into profiles values ($1,true,'staff'),($2,true,'student_leader')", [user,other])
    await db.query("insert into follow_up_campaigns values ($1,'active'),($2,'closed')", [campaign,old])
    await db.query("select set_config('test.user',$1,false)", [user])
    const counts = async () => (await db.query('select get_my_contact_attention() as counts')).rows[0].counts
    assert.deepEqual(await counts(), { unattempted:0,staleGoBacks:0,newBelievers:0,total:0 })
    async function contact({ owner=user, camp=campaign, status='uncontacted', believer=null, events=[] }={}) {
      const id=randomUUID()
      await db.query(`insert into follow_up_contacts values ($1,$2,$3,$4,case when $5::text is null then null else now()-$5::interval end)`, [id,camp,owner,status,believer])
      for (const [type,age] of events) await db.query('insert into follow_up_events values ($1,$2,now()-$3::interval)',[id,type,age])
      return id
    }
    // Keep now() stable to test exact inclusive thresholds.
    await db.exec('begin')
    const untouched=await contact()
    for (const type of ['knock','text_attempt','interaction']) await contact({events:[[type,'1 hour']]})
    await contact({owner:other})
    await contact({camp:old})
    await contact({owner:null})
    await contact({status:'go_back',events:[['interaction','7 days']]})
    await contact({status:'go_back',events:[['interaction','8 days'],['text_attempt','1 hour']]})
    await contact({status:'go_back',events:[['interaction','6 days 23 hours']]})
    // This one is in two categories but must add only one to total.
    await contact({status:'go_back',believer:'8 days',events:[['interaction','8 days']]})
    await contact({believer:'24 hours',events:[['interaction','24 hours'],['knock','1 hour']]})
    await contact({believer:'23 hours',events:[['interaction','23 hours']]})
    await contact({believer:'2 days',events:[['interaction','2 days'],['interaction','1 day']]})
    assert.deepEqual(await counts(),{unattempted:1,staleGoBacks:2,newBelievers:2,total:4})
    // A later interaction resolves new-believer attention; attempts alone do not.
    await db.query("insert into follow_up_events select id,'interaction',now() from follow_up_contacts where received_christ_at is not null and primary_owner_id=$1",[user])
    assert.deepEqual(await counts(),{unattempted:1,staleGoBacks:1,newBelievers:0,total:2})
    // Reassignment removes the contact from this user's counts immediately.
    await db.query('update follow_up_contacts set primary_owner_id=$1 where id=$2',[other,untouched])
    assert.equal((await counts()).unattempted,0)
    await db.query("select set_config('test.user',$1,false)",[other])
    assert.deepEqual(await counts(),{unattempted:2,staleGoBacks:0,newBelievers:0,total:2})
    await db.exec('commit')
    await db.query("update profiles set role='pending' where id=$1",[other])
    await assert.rejects(counts,/Active Follow Up access/)
    await db.query("update profiles set role='staff',is_active=false where id=$1",[other])
    await assert.rejects(counts,/Active Follow Up access/)
    await db.query("select set_config('test.user','',false)")
    await assert.rejects(counts,/signed in/)
    const rights=(await db.query("select has_function_privilege('anon','public.get_my_contact_attention()','EXECUTE') as anon, has_function_privilege('authenticated','public.get_my_contact_attention()','EXECUTE') as approved")).rows[0]
    assert.deepEqual(rights,{anon:false,approved:true})
  } finally { await db.close() }
})
