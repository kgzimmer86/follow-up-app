import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const migration = name => readFile(new URL(`../migrations/${name}.sql`, import.meta.url), 'utf8')

test('invitation filters preserve Follow Up parity, combine with current roster, and filter before pagination', async t => {
  const db = new PGlite(); t.after(() => db.close())
  // Reconstructed existing columns/constraints, actual contact-query SQL and
  // Community migrations. No exported database or real contacts are accessed.
  await db.exec(`create role authenticated; create role anon; create schema auth; create schema private;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;`)
  await db.exec(await readFile(new URL('./fixtures/exported-core-schema.sql', import.meta.url),'utf8'))
  await db.exec(`
    create table follow_up_events(id uuid primary key default gen_random_uuid(),contact_id uuid,performed_by uuid,event_type text,
      occurred_at timestamptz default now(),created_at timestamptz default now(),notes text,text_purposes text[],text_event_name text,invited_to_community_group boolean default false);
    create table follow_up_contact_affinities(contact_id uuid,ministry_area_id uuid);
    create table follow_up_contact_merge_log(id uuid primary key default gen_random_uuid(),kept_student_id uuid,merged_student_id uuid);
  `)
  for (const name of ['20260909_three_digit_dorm_floors','20260911_community_groups_foundation','20260914_community_events','20260915_invitation_assignments']) await db.exec(await migration(name))
  const original = async () => (await db.query("select pg_get_functiondef(oid) d from pg_proc where proname='get_follow_up_contact_results_v2'")).rows[0].d
  const before = await original()
  const newSql = await migration('20260915_invitation_contact_filters')
  await db.exec(newSql); await db.exec(newSql)
  assert.equal(await original(), before, 'installed Follow Up query remains unchanged')
  const admin=id(1), leader=id(2), campaign=id(3), north=id(4), dorm=id(5), otherDorm=id(6), affinity=id(7), event=id(8), group=id(9), otherGroup=id(10)
  await db.query('insert into auth.users values($1),($2)',[admin,leader])
  await db.query("insert into profiles(id,role,display_name) values($1,'admin','Test admin'),($2,'student_leader','Test leader')",[admin,leader])
  await db.query("select set_config('test.user',$1,false)",[admin])
  await db.query("insert into follow_up_campaigns(id,academic_year,label,starts_on,ends_on,status) values($1,'TEST','Invented year',current_date-90,current_date+90,'active')",[campaign])
  await db.query("insert into ministry_areas(id,name,slug,area_type) values($1,'North','north','campus_region'),($2,'Affinity','affinity','affinity')",[north,affinity])
  await db.query("insert into ministry_areas(id,name,slug,area_type,parent_id) values($1,'Bursley','bursley','dorm',$3),($2,'Other dorm','other','dorm',$3)",[dorm,otherDorm,north])
  await db.query("insert into community_events(id,campaign_id,name,event_date) values($1,$2,'Test event',current_date+10)",[event,campaign])
  for (const g of [group,otherGroup]) await db.query("insert into community_groups(id,campaign_id,ministry_area_id,name) values($1,$2,$3,'Test group')",[g,campaign,dorm])
  await db.query('insert into community_group_leaders(group_id,profile_id) values($1,$2)',[group,leader])
  // Most contacts precede the late matching roster names alphabetically.
  await db.exec("insert into students(id,display_name,uniqname) select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Invented '||lpad(n::text,5,'0'),'test'||n from generate_series(1,1000) n")
  await db.query(`insert into follow_up_contacts(campaign_id,student_id,ministry_location_id,status,gender_raw,community_interest,jesus_interest,interview_interest,room_or_address)
    select $1,id,case when right(display_name,1)='1' then $3::uuid else $2::uuid end,
      case when right(display_name,1)='0' then 'involved' else 'uncontacted' end,
      case when right(display_name,1) in ('0','2','4','6','8') then 'Male' else 'Female' end,
      case when right(display_name,1) in ('0','1','2') then 'yes' when right(display_name,1) in ('3','4','5') then 'maybe' when right(display_name,1)='6' then null else 'no' end,
      'yes','maybe','210' from students`,[campaign,dorm,otherDorm])
  await db.query("insert into follow_up_contact_affinities select id,$1 from follow_up_contacts where community_interest='yes'",[affinity])
  await db.query("insert into community_group_memberships(group_id,student_id,started_on) select $1,id,current_date-10 from students where display_name>='Invented 00851'",[group])
  await db.query("update community_group_memberships set ended_on=current_date where student_id=(select id from students where display_name='Invented 00900')")
  const call = async (scoped, filters={}, roster=null, search='') => {
    const args = scoped ? [event, roster, search] : []
    const lead = scoped ? '$1,$2,$3,' : ''
    const params = Object.entries(filters).map(([key,value]) => { args.push(value); return `${key}=>$${args.length}` })
    return (await db.query(`select ${scoped?'get_invitation_contact_results':'get_follow_up_contact_results_v2'}(${lead}'area'${params.length?','+params.join(','):''}) r`,args)).rows[0].r
  }
  for (const filters of [{}, {p_location:dorm,p_gender:'male',p_community:'yes,maybe'}, {p_campus:north,p_affinity:affinity},
    {p_status:'involved'}, {p_community:'unanswered'}, {p_jesus:'yes',p_interview:'maybe'},
    {p_kgp:'not_shared',p_interview_done:'not_completed',p_invited_to_cg:'not_invited'},
    {p_location:dorm,p_floor:'2',p_room_only:true}, {p_location:'no_address'}]) {
    assert.deepEqual(await call(true,filters),await call(false,filters),JSON.stringify(filters))
  }
  const roster = await call(true,{},group)
  assert.equal(roster.total_count,149); assert.equal(roster.rows.length,50)
  assert.ok(roster.rows.every(r=>r.display_name>='Invented 00851'))
  const page2=await call(true,{p_page:2},group)
  assert.equal(new Set([...roster.rows,...page2.rows].map(r=>r.id)).size,100)
  const combined=await call(true,{p_location:dorm,p_gender:'male',p_community:'yes,maybe'},group)
  assert.ok(combined.total_count>0 && combined.total_count<149)
  assert.ok(combined.rows.every(r=>r.gender_raw==='Male' && ['yes','maybe'].includes(r.community_interest) && r.ministry_location_id===dorm && r.display_name!=='Invented 00900'))
  assert.equal((await call(true,{},group,'test1000')).total_count,1,'search filters before pagination')
  await db.exec(await migration('20260916_invitation_assignable_results'))
  await db.exec(await migration('20260916_invitation_assignable_results'))
  const multiSql = await migration('20260927_invitation_multi_filters')
  const legacy = await call(true, {p_status:'involved',p_affinity:affinity})
  await db.exec(multiSql); await db.exec(multiSql)
  assert.deepEqual(await call(true,{p_status:'involved',p_affinity:affinity}),legacy)
  const secondAffinity=id(77)
  await db.query("insert into ministry_areas(id,name,slug,area_type) values($1,'Second test affinity','second-test','affinity')",[secondAffinity])
  await db.query("insert into follow_up_contact_affinities select id,$1 from follow_up_contacts where community_interest='maybe'",[secondAffinity])
  const union=await call(true,{p_status:'uncontacted,involved',p_affinity:`${affinity},${secondAffinity}`})
  assert.equal(union.total_count,600)
  assert.equal((await call(true,{p_status:'__no_matches'})).total_count,0)
  assert.equal((await call(true,{p_status:'involved',p_affinity:`${affinity},${secondAffinity}`})).total_count,100)
  const assignmentMulti=(await db.query("select get_invitation_assignment_results($1,null,'','area',p_status=>'uncontacted,involved',p_affinity=>$2) r",[event,`${affinity},${secondAffinity}`])).rows[0].r
  assert.deepEqual(assignmentMulti,union,'assignment query supports the same multi-selection before pagination')
  await db.query(`insert into community_event_invitations(event_id,student_id,status,first_invited_at)
    select $1,id,'invited',now() from students where display_name<'Invented 00901'`,[event])
  await db.query(`insert into community_event_invitations(event_id,student_id,status,assigned_to)
    select $1,id,'not_asked',$2 from students where display_name='Invented 00901'`,[event,leader])
  const available = async (only=true,page=1) => (await db.query("select get_invitation_assignment_results($1,null,'','area',p_assignable_only=>$2,p_page=>$3) r",[event,only,page])).rows[0].r
  assert.equal((await available(false)).total_count,1000,'spreadsheet retains all rows')
  assert.equal((await available()).total_count,100,'staff may reassign untouched invitations')
  assert.equal((await available()).rows.length,50,'filter fills pages before pagination')
  assert.ok((await available()).rows.every(r=>r.display_name>='Invented 00901'))
  assert.equal((await available(true,2)).rows.length,50)
  await db.query("select set_config('test.user',$1,false)",[leader])
  assert.equal((await available()).total_count,99,'leaders cannot claim already assigned invitations')
  await db.query('update community_events set is_open=false where id=$1',[event])
  assert.equal((await available()).total_count,0,'closed events have no assignable rows')
  assert.equal((await available(false)).total_count,1000)
  await db.query('update community_events set is_open=true where id=$1',[event])
  assert.equal((await call(true,{},group)).total_count,149)
  await assert.rejects(call(true,{},otherGroup),/not available/)
  await db.query('update profiles set is_active=false where id=$1',[leader])
  await assert.rejects(call(true),/Active Follow Up/)
  await db.query("select set_config('test.user',$1,false)",[admin])
  await db.query("update follow_up_campaigns set status='archived' where id=$1",[campaign])
  await assert.rejects(call(true),/No active/)
  await db.exec('set role anon'); await assert.rejects(call(true),/permission denied/); await db.exec('reset role')
  t.diagnostic('Actual contact-query filter parity on reconstructed schema; no hosted latency or full-export security claim.')
})
