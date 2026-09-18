import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { generateNextStepIdeas, parseNextStepIdeas } from './next-step-ideas.ts'
const require = createRequire(import.meta.url)
const ts = require('typescript')
const contactId='00000000-0000-4000-8000-000000000001'
const ideas = [1,2,3].map(i=>({action:`Invented option ${i}`,timing:'This week'}))

test('AI response requires three distinct short options and handles refusal/incomplete output',async()=>{
  assert.deepEqual(parseNextStepIdeas({ideas}),ideas)
  for(const value of [null,{ideas:[]},{ideas:[ideas[0],ideas[0],ideas[0]]},{ideas:[{action:'a'.repeat(281),timing:'Soon'},...ideas.slice(1)]}]) assert.throws(()=>parseNextStepIdeas(value))
  for(const result of [{status:'incomplete'}, {status:'completed',output:[{type:'message',content:[{type:'refusal'}]}]}]) {
    await assert.rejects(generateNextStepIdeas({apiKey:'test',model:'test',guidance:'Invented test instructions',context:{},request:async()=>Response.json(result)}))
  }
  let body
  const result=await generateNextStepIdeas({apiKey:'test',model:'test-model',guidance:'Invented test instructions',context:{history:['Older promise','Recent conversation']},request:async(url,init)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');body=JSON.parse(init.body)
    return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({ideas})}]}]})
  }})
  assert.deepEqual(result,ideas);assert.equal(body.store,false);assert.equal(body.text.format.strict,true)
  assert.match(body.input,/Older promise/);assert.match(body.input,/Recent conversation/)
  assert.equal(body.tools,undefined)
})

const source=await readFile(new URL('../app/api/next-step-ideas/route.ts',import.meta.url),'utf8')
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
function route({env={},role='student_leader',active=true,owner='leader',failTable='',rate=true}={}) {
  const base={NEXT_STEPS_AI_ENABLED:'true',VERCEL_ENV:'preview',NEXT_PUBLIC_SUPABASE_URL:'https://tcbwepqkvnquxkbtaxcl.supabase.co',NEXT_STEPS_AI_TEST_CONTACT_IDS:contactId,OPENAI_API_KEY:'fake',OPENAI_NEXT_STEPS_MODEL:'test',NEXT_STEPS_MINISTRY_GUIDANCE:'Invented guidance',...env}
  const generated=[],calls=[]
  const db={rpc:async()=>({data:rate}),from:table=>{
    calls.push(table)
    const result=()=>({error:table===failTable?{}:null,data:table==='follow_up_contacts'?{id:contactId,student_id:'student',campaign_id:'campaign',primary_owner_id:owner,status:'go_back'}:table==='follow_up_campaigns'?{status:'active'}:table==='follow_up_events'?[{notes:'An older invented commitment',occurred_at:'2020-01-01'}]:[]})
    const builder={then:(resolve,reject)=>Promise.resolve(result()).then(resolve,reject)}
    for(const method of ['select','eq','order','range','limit','maybeSingle']) builder[method]=()=>builder
    return builder
  }}
  const testModule={exports:{}}
  vm.runInNewContext(compiled,{module:testModule,exports:testModule.exports,process:{env:base},Response,URL,Date,JSON,require:name=>{
    if(name==='@/lib/supabase/access')return {getAppAccess:async()=>({user:{id:'leader'},profile:{role,is_active:active}})}
    if(name==='@/lib/supabase/server')return {createClient:async()=>db}
    if(name==='@/lib/next-step-ideas')return {generateNextStepIdeas:async options=>{generated.push(options);return ideas}}
    throw new Error(name)
  }})
  return {generated,calls,post:(body={contactId},origin='https://test.example')=>testModule.exports.POST(new Request('https://test.example/api/next-step-ideas',{method:'POST',headers:{origin},body:JSON.stringify(body)}))}
}
test('API denies production, non-test database, unapproved accounts and non-fictional contacts before generation',async()=>{
  for(const options of [{env:{VERCEL_ENV:'production'}},{env:{NEXT_PUBLIC_SUPABASE_URL:'https://other.supabase.co'}},{env:{NEXT_STEPS_AI_TEST_CONTACT_IDS:''}},{role:'pending'},{active:false},{owner:'other'}]){
    const r=route(options);assert.ok((await r.post()).status>=400);assert.equal(r.generated.length,0)
  }
  const r=route();assert.equal((await r.post({},'https://other.example')).status,403)
  assert.equal((await r.post({contactId:'bad'})).status,400)
})
test('API refuses incomplete context and exhausted budget; valid request includes old notes and permitted community data',async()=>{
  for(const failTable of ['follow_up_events','community_group_attendance','community_group_memberships','community_event_invitations']){
    const r=route({failTable});assert.equal((await r.post()).status,503);assert.equal(r.generated.length,0)
  }
  const limited=route({rate:false});assert.equal((await limited.post()).status,429);assert.equal(limited.generated.length,0)
  const r=route(),response=await r.post();assert.equal(response.status,200)
  assert.equal(response.headers.get('cache-control'),'no-store')
  assert.match(JSON.stringify(r.generated[0].context),/older invented commitment/)
  assert.equal(r.generated[0].context.contact.student_id,undefined)
  assert.deepEqual((await response.json()).ideas,ideas)
})
