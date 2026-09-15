import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'

const require=createRequire(import.meta.url), ts=require('typescript')
function harness(file) {
  const state=[], calls=[], navigations=[]
  let cursor=0, refreshes=0, failure=null
  const testModule={exports:{}}
  const code=ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
  vm.runInNewContext(code,{module:testModule,exports:testModule.exports,URL,window:{location:{origin:'https://example.invalid'}},require:name=>{
    if(name==='react')return {
      useState:initial=>{const index=cursor++;if(!(index in state))state[index]=initial;return [state[index],value=>{state[index]=value}]},
      useTransition:()=>[false,fn=>fn()],
    }
    if(name==='next/navigation')return {useRouter:()=>({replace:(...args)=>navigations.push(args),refresh:()=>refreshes++})}
    if(name==='@/lib/supabase/client')return {createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {error:failure}}})}
    return require(name)
  }})
  return {calls,navigations,refreshes:()=>refreshes,fail:error=>{failure=error},render:props=>{cursor=0;return Object.values(testModule.exports)[0](props)}}
}
function nodes(tree) {
  if(Array.isArray(tree))return tree.flatMap(nodes)
  if(!tree || typeof tree!=='object')return []
  return [tree,...nodes(tree.props?.children)]
}
const button=(tree,text)=>nodes(tree).find(node=>node.type==='button'&&node.props.children===text)

test('name search preserves filters, escapes names, resets pagination, and clears only the query',()=>{
  const h=harness('../components/follow-up/contact-name-search.tsx')
  const props={href:'/contacts/area?context=1&location=dorm&sort=room&display=sheet&page=4&q=Old',query:'Old'}
  let tree=h.render(props)
  nodes(tree).find(node=>node.type==='input').props.onChange({target:{value:'  O\'Brien & Smith  '}})
  tree=h.render(props)
  tree.props.onSubmit({preventDefault(){}})
  let url=new URL(h.navigations[0][0],'https://example.invalid')
  assert.equal(url.pathname,'/contacts/area')
  assert.equal(url.searchParams.get('q'),"O'Brien & Smith")
  assert.equal(url.searchParams.get('page'),null)
  for(const [key,value] of [['location','dorm'],['sort','room'],['display','sheet'],['context','1']])assert.equal(url.searchParams.get(key),value)
  button(tree,'Clear').props.onClick()
  url=new URL(h.navigations[1][0],'https://example.invalid')
  assert.equal(url.searchParams.get('q'),null)
  assert.equal(url.searchParams.get('location'),'dorm')
  assert.equal(h.calls.length,0)
})

test('self-unassign requires confirmation, submits only the contact ID and refreshes after success',async()=>{
  const h=harness('../components/follow-up/self-unassign-contact.tsx'), props={contactId:'invented-contact'}
  button(h.render(props),'Unassign from me').props.onClick()
  assert.equal(h.calls.length,0)
  button(h.render(props),'Cancel').props.onClick()
  assert.equal(h.calls.length,0)
  button(h.render(props),'Unassign from me').props.onClick()
  button(h.render(props),'Yes, unassign from me').props.onClick()
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(h.calls.length,1)
  assert.equal(h.calls[0].name,'unassign_my_follow_up_contact')
  assert.equal(JSON.stringify(h.calls[0].args),JSON.stringify({p_contact_id:props.contactId}))
  assert.equal(h.refreshes(),1)
  assert.equal(h.render(props).props.role,'status')
})

test('stale ownership or network failure stays visible and does not claim success',async()=>{
  const h=harness('../components/follow-up/self-unassign-contact.tsx'), props={contactId:'invented-contact'}
  h.fail({message:'This contact is no longer assigned to you.'})
  button(h.render(props),'Unassign from me').props.onClick()
  button(h.render(props),'Yes, unassign from me').props.onClick()
  await new Promise(resolve=>setImmediate(resolve))
  const tree=h.render(props)
  assert.equal(nodes(tree).find(node=>node.props?.role==='alert').props.children,'This contact is no longer assigned to you.')
  assert.equal(h.refreshes(),0)
  assert(button(tree,'Yes, unassign from me'))
})
