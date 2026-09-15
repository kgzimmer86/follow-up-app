import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'
import { pushBody, validPushEndpoint } from './push.ts'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = await readFile(new URL('../app/api/push/dispatch/route.ts',import.meta.url),'utf8')
const compiled = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
function dispatcher({jobs=[],sendError=null,claimError=null,ackError=null,configured=true}={}) {
  const calls=[],sent=[]
  const db={rpc:async(name,args)=>{calls.push({name,args});return name==='follow_up_push_claim'?{data:jobs,error:claimError}:{error:ackError}}}
  const env={PUSH_CRON_SECRET:'a'.repeat(64),NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-only-test',NEXT_PUBLIC_VAPID_PUBLIC_KEY:'public-test',VAPID_PRIVATE_KEY:'private-test',VAPID_SUBJECT:'https://follow-up-app-red.vercel.app'}
  if(!configured) delete env.VAPID_PRIVATE_KEY
  const testModule={exports:{}}
  vm.runInNewContext(compiled,{module:testModule,exports:testModule.exports,Buffer,Date,AbortSignal,Response,Promise,process:{env},require:name=>{
    if(name==='node:crypto')return require(name)
    if(name==='@supabase/supabase-js')return {createClient:()=>db}
    if(name==='@/lib/push')return {pushBody,validPushEndpoint}
    if(name==='web-push')return {sendNotification:async(sub,payload,options)=>{sent.push({sub,payload:JSON.parse(payload),options});if(sendError)throw sendError}}
    throw new Error(name)
  }})
  return {calls,sent,post:authorization=>testModule.exports.POST(new Request('https://follow-up-app-red.vercel.app/api/push/dispatch',{method:'POST',headers:authorization===undefined?{Authorization:`Bearer ${env.PUSH_CRON_SECRET}`}:{Authorization:authorization}}))}
}
const job={id:'device',lease:'lease',endpoint:'https://web.push.apple.com/test',p256dh:'p256dh-test',auth:'auth-test',sentAt:123,snapshot:{contacts:5,invitations:0,groups:0,total:5,fingerprint:'private-fingerprint'}}
test('dispatch rejects missing, wrong, and non-ASCII secrets without accessing database',async()=>{
  for(const secret of ['', 'Bearer wrong',`Bearer ${'é'.repeat(64)}`]){
    const d=dispatcher();assert.equal((await d.post(secret)).status,401);assert.equal(d.calls.length,0)
  }
})
test('dispatch sends one generic encrypted payload per job then acknowledges exact lease',async()=>{
  const d=dispatcher({jobs:[job]});assert.equal((await d.post()).status,200)
  assert.equal(d.sent.length,1);assert.equal(d.sent[0].payload.count,5)
  assert.equal(d.sent[0].payload.subscriptionId,'device')
  assert.equal(d.sent[0].payload.fingerprint,undefined)
  assert.equal(d.sent[0].options.topic,'follow-up-attention')
  assert.equal(d.calls[1].args.p_lease,'lease');assert.equal(d.calls[1].args.p_result,'sent')
})
test('invalid endpoints are discarded without outgoing HTTP; expired providers are removed',async()=>{
  const invalid=dispatcher({jobs:[{...job,endpoint:'http://localhost/secret'}]})
  assert.equal((await invalid.post()).status,200);assert.equal(invalid.sent.length,0)
  assert.equal(invalid.calls[1].args.p_result,'expired')
  for(const statusCode of [404,410]){
    const d=dispatcher({jobs:[job],sendError:{statusCode}});await d.post()
    assert.equal(d.calls[1].args.p_result,'expired')
  }
})
test('transient failures retry without marking sent; missing setup and failed claims do not send',async()=>{
  const retry=dispatcher({jobs:[job],sendError:{statusCode:429}})
  assert.equal((await retry.post()).status,503);assert.equal(retry.calls[1].args.p_result,'retry')
  for(const options of [{configured:false},{claimError:{message:'test'}}]){
    const d=dispatcher(options);assert.equal((await d.post()).status,503);assert.equal(d.sent.length,0)
  }
  const ack=dispatcher({jobs:[job],ackError:{message:'test'}})
  assert.equal((await ack.post()).status,503)
})
