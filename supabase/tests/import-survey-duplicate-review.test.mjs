import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { setup } from './community-regression.test.mjs'
const campaign='00000000-0000-4000-8000-000000000002'
const dorm='00000000-0000-4000-8000-000000000004'
const migration=await readFile(new URL('../migrations/20260923_import_survey_duplicate_review.sql',import.meta.url),'utf8')
async function ready(t) {
  const state=await setup(t,true)
  await state.db.exec(`drop function private.follow_up_normalize_phone(text),private.follow_up_normalize_uniqname(text),private.follow_up_normalize_match_text(text),private.follow_up_names_weakly_compatible(text,text);`)
  await state.db.exec(await readFile(new URL('./fixtures/exported-import-match-functions.sql',import.meta.url),'utf8'))
  await state.db.exec(migration)
  return state
}
const input=(extra={})=>({row_number:2,action:'import',name:'Invented Alex',location:'Invented Dorm',room_or_address:'101',affinities:[],...extra})
async function seed(db,extra={}) {
  const student=(await db.query(`insert into students(display_name,uniqname,phone) values('Invented Alex',$1,$2) returning id`,[extra.uniqname??'inventedalex',extra.phone??'2025550101'])).rows[0].id
  return (await db.query(`insert into follow_up_contacts(campaign_id,student_id,contact_origin,ministry_location_id,room_or_address,phone,primary_owner_id,status,jesus_interest) values($1,$2,$3,$4,'101',$5,'00000000-0000-4000-8000-000000000001','go_back','yes') returning id`,[campaign,student,extra.origin??'survey',dorm,extra.phone??'2025550101'])).rows[0].id
}
const preview=(rpc,row)=>rpc('preview_survey_import_weak_matches',[campaign,[row]])
const commit=(rpc,row)=>rpc('import_survey_rows_v2',[campaign,'invented-only.csv',[],[row]])
test('survey name/location/room matches include missing or conflicting identifiers; idempotent migration',async t=>{
  const {db,rpc}=await ready(t); await seed(db)
  for(const row of [input(),input({uniqname:'inventedale',phone:'2025550102'})]) {
    const [p]=await preview(rpc,row); assert.equal(p.candidate_count,1)
    assert.equal(p.candidates[0].contact_origin,'survey')
    if(row.phone) {assert.equal(p.candidates[0].phone_differs,true);assert.equal(p.candidates[0].identity_conflict,true)}
  }
  assert.equal((await preview(rpc,input({room_or_address:'102'})))[0].candidate_count,0)
  await db.exec(migration)
})
test('unreviewed import rolls back; explicit unchanged keep-separate is allowed',async t=>{
  const {db,rpc}=await ready(t); await seed(db); const row=input()
  await assert.rejects(commit(rpc,row),/not reviewed/)
  assert.equal((await db.query('select count(*)::int n from survey_imports')).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from students')).rows[0].n,1)
  row.reviewed_match_candidates=(await preview(rpc,row))[0].candidates; row.match_review_choice='keep_separate'
  await commit(rpc,row)
  assert.equal((await db.query('select count(*)::int n from follow_up_contacts')).rows[0].n,2)
})
test('reviewed survey merge preserves old survey values and assignment',async t=>{
  const {db,rpc}=await ready(t); const keep=await seed(db);const row=input({action:'merge_into_existing',merge_contact_id:keep,jesus_interest:'no'})
  row.reviewed_match_candidates=(await preview(rpc,row))[0].candidates
  await commit(rpc,row)
  const records=(await db.query('select id,primary_owner_id,jesus_interest from follow_up_contacts')).rows
  assert.equal(records.length,1);assert.equal(records[0].id,keep);assert.equal(records[0].jesus_interest,'yes');assert.ok(records[0].primary_owner_id)
})
test('conflicting identity and phone block merges even with reviewed evidence',async t=>{
  const {db,rpc}=await ready(t);const keep=await seed(db)
  for(const extra of [{uniqname:'inventedale'},{phone:'2025550102'}]) {
    const row=input({action:'merge_into_existing',merge_contact_id:keep,...extra})
    row.reviewed_match_candidates=(await preview(rpc,row))[0].candidates
    await assert.rejects(commit(rpc,row),/Merge blocked/)
  }
})
test('changed evidence and new candidates invalidate keep-separate review',async t=>{
  const {db,rpc}=await ready(t); const keep=await seed(db); const row=input({match_review_choice:'keep_separate'})
  row.reviewed_match_candidates=(await preview(rpc,row))[0].candidates
  await db.query("update follow_up_contacts set status='involved' where id=$1",[keep])
  await assert.rejects(commit(rpc,row),/not reviewed/)
  row.reviewed_match_candidates=(await preview(rpc,row))[0].candidates
  await seed(db,{uniqname:'anotheralex'})
  await assert.rejects(commit(rpc,row),/not reviewed/)
})
test('strong identity match with a phone conflict cannot refresh the existing contact',async t=>{
  const {db,rpc}=await ready(t);await seed(db)
  await assert.rejects(commit(rpc,input({uniqname:'inventedalex',phone:'2025550102',action:'update_existing'})),/Conflicting possible match/)
})
test('missing/inactive management role cannot call expanded preview',async t=>{
  const {db,rpc}=await ready(t);await seed(db)
  await db.exec('update profiles set is_active=false')
  await assert.rejects(preview(rpc,input()),/Management access required/)
})
