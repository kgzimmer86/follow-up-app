import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const source = readFileSync(new URL('../components/follow-up/mobile-results-paginator.tsx', import.meta.url), 'utf8')

test('mobile scroll lifecycle ignores jitter, toggles direction, suppresses duplicates and cleans up', () => {
  let effect, visible=false, mobile=true, regularTop=2000, pending, bottom=0
  const listeners=new Map()
  let refs=0, states=0
  const fakeReact={
    useEffect: fn => { effect=fn },
    useRef: () => ({current: refs++===0 ? {getBoundingClientRect:()=>({top:regularTop,bottom:regularTop+60})} : {contains:()=>false}}),
    useState: initial => [initial, states++===0 ? value=>{visible=value} : value=>{bottom=value}],
  }
  const loaded={exports:{}}
  const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText
  Function('require','module','exports',compiled)(name=>name==='react'?fakeReact:name==='next/link'?()=>null:require(name),loaded,loaded.exports)
  const originals=Object.fromEntries(['window','document','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]))
  try {
    globalThis.window={scrollY:300,innerHeight:800,matchMedia:()=>({get matches(){return mobile},addEventListener(){},removeEventListener(){}}),addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)}
    globalThis.document={documentElement:{scrollHeight:4000},activeElement:null,querySelector:()=>({getBoundingClientRect:()=>({height:95})}),getElementById:()=>({getBoundingClientRect:()=>({top:-100})})}
    globalThis.ResizeObserver=class {observe(){} disconnect(){}}
    globalThis.requestAnimationFrame=fn=>{pending=fn;return 1}
    globalThis.cancelAnimationFrame=()=>{pending=null}
    loaded.exports.MobileResultsPaginator({page:2,pages:5,previous:'/contacts?page=1',next:'/contacts?page=3',children:null})
    const cleanup=effect()
    const flush=()=>{const fn=pending;pending=null;fn?.()}
    flush(); assert.equal(visible,false); assert.equal(bottom,103)
    const scroll=y=>{window.scrollY=y;listeners.get('scroll')();flush()}
    scroll(295);assert.equal(visible,false)
    scroll(280);assert.equal(visible,true)
    scroll(300);assert.equal(visible,false)
    scroll(280);assert.equal(visible,true)
    regularTop=600;scroll(260);assert.equal(visible,false)
    regularTop=2000;scroll(240);assert.equal(visible,true)
    mobile=false;scroll(220);assert.equal(visible,false)
    mobile=true;scroll(50);assert.equal(visible,false)
    cleanup();assert.equal(listeners.size,0)
  } finally {
    for(const [key,descriptor] of Object.entries(originals)) {
      if(descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key]
    }
  }
})

test('hidden pagination is inert, respects reduced motion and preserves normal pagination', () => {
  assert.match(source,/inert={!visible}/)
  assert.match(source,/motion-reduce:transition-none md:hidden/)
  assert.match(source,/prefetch={false}/)
  const page=readFileSync(new URL('../components/follow-up/contact-results-page.tsx',import.meta.url),'utf8')
  assert.match(page,/totalPages > 1 && \(\s*<MobileResultsPaginator/)
  assert.match(page,/aria-label="Contact results pages"/)
  assert.match(page,/next=.*resultsHref\(\{ basePath, sort: sortBy, dir: sortDir, filters, page: currentPage \+ 1/)
})
