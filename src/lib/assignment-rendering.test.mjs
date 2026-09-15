import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'

const require=createRequire(import.meta.url)
const ts=require('typescript'), React=require('react'), {renderToStaticMarkup}=require('react-dom/server')
function compile(file,overrides={}) {
  const source=readFileSync(new URL(file,import.meta.url),'utf8')
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText
  const testModule={exports:{}}
  vm.runInNewContext(code,{module:testModule,exports:testModule.exports,document:overrides.document,require:name=>{
    if(name in overrides)return overrides[name]
    if(name==='next/link')return function TestLink({children}) { return React.createElement('a',{},children) }
    if(name==='next/navigation')return {usePathname:()=>'/assign-contacts',useSearchParams:()=>new URLSearchParams()}
    if(name==='@/lib/supabase/client')return {createClient:()=>{throw new Error('No database access in render test')}}
    if(name==='@/lib/contact-name')return require('./contact-name.ts')
    if(name==='@/lib/assignment-viewport')return require('./assignment-viewport.ts')
    if(name==='./assignment-assignee-select')return compile('../components/follow-up/assignment-assignee-select.tsx')
    if(name==='./assignment-contact-window')return compile('../components/follow-up/assignment-contact-window.tsx')
    return require(name)
  }})
  return testModule.exports
}

test('large assignment list initially mounts only twenty cards and retains the full contact count',()=>{
  const {ContactAssignmentWorkspace}=compile('../components/follow-up/contact-assignment-workspace.tsx')
  const workspace={role:'admin',scope:'Invented fixture',assignees:Array.from({length:100},(_,i)=>({id:`user-${i}`,display_name:`Invented Leader ${i}`,role:'staff',area_name:'Invented Area'})),contacts:Array.from({length:1000},(_,i)=>({id:`contact-${i}`,display_name:`Invented Contact ${i}`,status:'uncontacted',primary_owner_id:i%2?'user-0':null,primary_owner_name:i%2?'Invented Leader 0':null}))}
  const html=renderToStaticMarkup(React.createElement(ContactAssignmentWorkspace,{initialWorkspace:workspace}))
  assert.equal((html.match(/<article/g)||[]).length,20,'offscreen sections contain no form controls')
  assert.equal((html.match(/<option/g)||[]).length,33)
  assert.doesNotMatch(html,/Invented Contact 999/)
  assert.match(html,/1000/,'the full dataset still supplies counts and filtering')
  assert.match(html,/Invented Leader 0 • Staff • Invented Area/,'current owner label is retained')
})

test('native picker expands before focus/pointer/keyboard default actions and preserves offscreen selection',()=>{
  for(const trigger of ['onFocus','onPointerDown','onKeyDown']) {
    let cursor=0,callback,flushes=0
    const cells=[],doc={activeElement:null}
    const fakeReact={memo:fn=>fn,useRef:initial=>{const i=cursor++;return cells[i]??=( {current:initial})},useState:initial=>{const i=cursor++;if(!(i in cells))cells[i]=initial;return [cells[i],value=>{cells[i]=value}]},useEffect:fn=>{callback=fn}}
    let visibility
    const {AssignmentAssigneeSelect}=compile('../components/follow-up/assignment-assignee-select.tsx',{
      react:fakeReact,'react-dom':{flushSync:fn=>{flushes++;fn()}},document:doc,
      '@/lib/assignment-viewport':{observeAssignmentSelect:(_el,fn)=>{visibility=fn;return()=>{}}},
    })
    const options=Array.from({length:100},(_,i)=>({id:`user-${i}`,label:`Invented Leader ${i}`}))
    let selected='user-99'
    const render=()=>{cursor=0;return AssignmentAssigneeSelect({options,value:selected,disabled:false,placeholder:'Choose',onChange:value=>{selected=value}})}
    const optionCount=tree=>1+tree.props.children[1].length
    let tree=render();assert.equal(optionCount(tree),2)
    const element={};tree.props.ref.current=element;callback()
    tree.props[trigger]();tree=render()
    assert.equal(flushes,1);assert.equal(optionCount(tree),101)
    doc.activeElement=element;visibility(false);tree=render()
    assert.equal(optionCount(tree),101,'do not remove choices while native picker has focus')
    tree.props.onChange({target:{value:'user-75'}});tree=render()
    assert.equal(tree.props.value,'user-75')
    doc.activeElement=null;tree.props.onBlur();tree=render()
    assert.equal(optionCount(tree),2);assert.equal(tree.props.children[1][0].props.value,'user-75')
    visibility(true);tree=render();assert.equal(optionCount(tree),101,'preload when approaching screen')
  }
})

test('search reaches the final contact before windowing and select-visible uses every filtered ID',()=>{
  const contacts=Array.from({length:3806},(_,i)=>({id:`contact-${i}`,display_name:`Invented Contact ${i}`,status:'uncontacted',primary_owner_id:null}))
  for(const query of ['Invented Contact 3805','']) {
    let stateIndex=0
    const {ContactAssignmentWorkspace}=compile('../components/follow-up/contact-assignment-workspace.tsx',{
      react:{...React,useState:initial=>{
        stateIndex++
        return React.useState(stateIndex===2?query:stateIndex===4?contacts.map(contact=>contact.id):initial)
      }},
    })
    const html=renderToStaticMarkup(React.createElement(ContactAssignmentWorkspace,{initialWorkspace:{role:'admin',scope:'Invented',contacts,assignees:[]}}))
    assert.match(html,/3806 contacts selected/,'selection remains independent of mounted rows')
    assert.match(html,/checked=""[^>]*\/>Select visible/,'all matching IDs are selected, including unmounted contacts')
    if(query) {
      assert.equal((html.match(/<article/g)||[]).length,1)
      assert.match(html,/Invented Contact 3805/)
    } else assert.equal((html.match(/<article/g)||[]).length,20)
  }
})
