import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'

const source = await readFile(new URL('../../public/sw.js', import.meta.url), 'utf8')
function worker() {
  let state
  const listeners = {}, notices = [], badges = [], navigations = []
  const client = { id:'client',url:'https://follow-up-app-red.vercel.app/contacts',navigate:async url=>navigations.push(url),focus:async()=>{} }
  const self = {
    location:{origin:'https://follow-up-app-red.vercel.app'},
    navigator:{setAppBadge:async count=>badges.push(count),clearAppBadge:async()=>badges.push(0)},
    registration:{showNotification:async(title,options)=>notices.push({title,...options}),getNotifications:async()=>notices.map(notice=>({close:()=>{notice.closed=true}}))},
    clients:{get:async()=>client,matchAll:async()=>[client],openWindow:async url=>navigations.push(url),claim:async()=>{}},
    skipWaiting:async()=>{},addEventListener:(event,callback)=>{listeners[event]=callback},
  }
  const indexedDB = {open:()=>{
    const request={}
    queueMicrotask(()=>{
      request.result={close:()=>{},transaction:()=>{
        const tx={objectStore:()=>({get:()=>({result:state}),put:value=>{state=structuredClone(value);return {result:undefined}}})}
        queueMicrotask(()=>tx.oncomplete());return tx
      }}
      request.onsuccess()
    })
    return request
  }}
  vm.runInNewContext(source,{self,indexedDB,URL,Date,Number,Promise})
  const dispatch=async(type,data={})=>{
    let done
    listeners[type]({...data,waitUntil:promise=>{done=promise}})
    await done
  }
  const message=data=>dispatch('message',{source:client,data,ports:[{postMessage:reply=>assert.equal(reply.ok,true)}]})
  const push=data=>dispatch('push',{data:{json:()=>data}})
  return {self,notices,badges,navigations,listeners,message,push,dispatch,state:()=>state}
}

test('worker updates badge and always shows visible notification, including zero',async()=>{
  const w=worker()
  await w.message({type:'BIND',id:'device-a'})
  await w.push({subscriptionId:'device-a',sentAt:100,count:5,body:'Five attention items'})
  assert.equal(w.badges.at(-1),5);assert.equal(w.notices.length,1)
  await w.push({subscriptionId:'device-a',sentAt:200,count:0,body:'All handled'})
  assert.equal(w.badges.at(-1),0);assert.equal(w.notices.length,2)
  assert.equal(w.notices[0].tag,w.notices[1].tag)
  assert.equal(w.listeners.fetch,undefined,'never cache student data or intercept app requests')
})
test('stale pushes cannot overwrite a newer foreground count',async()=>{
  const w=worker();await w.message({type:'BIND',id:'device-a'})
  await w.message({type:'SYNC',id:'device-a',count:2})
  await w.push({subscriptionId:'device-a',sentAt:1,count:5,body:'Stale five'})
  assert.equal(w.badges.at(-1),2);assert.doesNotMatch(w.notices.at(-1).body,/Stale/)
  assert.equal(w.notices.length,1,'Apple still requires a visible notice')
})
test('sign out clears stored binding and old account deliveries cannot restore its badge',async()=>{
  const w=worker();await w.message({type:'BIND',id:'device-a'})
  await w.push({subscriptionId:'device-a',sentAt:100,count:5,body:'Old account count'})
  await w.message({type:'CLEAR'})
  assert.equal(w.state().id,null);assert.equal(w.badges.at(-1),0);assert.equal(w.notices[0].closed,true)
  await w.push({subscriptionId:'device-a',sentAt:Date.now()+10,count:5,body:'Old account count'})
  assert.equal(w.badges.at(-1),0);assert.doesNotMatch(w.notices.at(-1).body,/Old account/)
  await w.message({type:'BIND',id:'device-b'})
  await w.message({type:'SYNC',id:'device-b',count:3})
  await w.push({subscriptionId:'device-a',sentAt:Date.now()+20,count:5,body:'Old account count'})
  assert.equal(w.badges.at(-1),3,'do not clear the new account count either')
})
test('notification click uses only fixed same-origin destination and focuses existing window',async()=>{
  const w=worker()
  await w.dispatch('notificationclick',{notification:{data:{url:'https://evil.test'},close:()=>{}}})
  assert.deepEqual(w.navigations,['https://follow-up-app-red.vercel.app/notifications'])
})
test('malformed pushes still display a generic notice without arbitrary counts',async()=>{
  const w=worker();await w.message({type:'BIND',id:'device-a'})
  await w.push({subscriptionId:'device-a',sentAt:100,count:-1,body:'Not valid'})
  assert.equal(w.badges.at(-1),0);assert.doesNotMatch(w.notices[0].body,/Not valid/)
  await w.dispatch('push',{data:{json:()=>{throw new Error('bad JSON')}}})
  assert.equal(w.notices.length,2)
})
