// Isolated browser fixture: real components, mocked Supabase transport and Next
// navigation. Never loads .env, authenticates, or contacts a remote database.
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
const require = createRequire(import.meta.url)
const ts = require('typescript')

async function browserBundle() {
  const sources = {}
  for (const [name, path] of Object.entries({
    react: 'react/cjs/react.production.js',
    'react-dom': 'react-dom/cjs/react-dom.production.js',
    'react-dom/client': 'react-dom/cjs/react-dom-client.production.js',
    'react/jsx-runtime': 'react/cjs/react-jsx-runtime.production.js',
    scheduler: 'scheduler/cjs/scheduler.production.js',
  })) sources[name] = await readFile(new URL(`../../../node_modules/${path}`, import.meta.url), 'utf8')
  for (const [name, path] of Object.entries({
    workspace: './next-step-workspace.tsx',
    './interaction-button': './interaction-button.tsx',
    '@/lib/next-steps': '../../lib/next-steps.ts',
    '@/lib/contact-name': '../../lib/contact-name.ts',
  })) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8')
    sources[name] = ts.transpileModule(source,{ compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
  }
  sources['next/link'] = `module.exports = function Link(props) { return require('react').createElement('a',props,props.children) }`
  sources['next/image'] = `module.exports = function Image(props) { return require('react').createElement('img',props) }`
  sources['next/navigation'] = `exports.useRouter=()=>({refresh(){},replace(){}});exports.usePathname=()=>'/contacts/next-steps';exports.useSearchParams=()=>new URLSearchParams();`
  sources['@/lib/supabase/client'] = `exports.createClient=()=>({rpc:window.mockRpc});`
  sources['./photo-cleanup-provider'] = `exports.usePhotoCleanup=()=>async()=> 'removed';`
  sources['@/lib/interaction-photo'] = `exports.interactionPhotoBucket='test';`
  sources['@/components/community/outreach-fields'] = `exports.OutreachFields=()=>null;`
  sources['@/components/community/celebration-listener'] = `exports.celebrationSaved=()=>{};`
  sources['@/components/community/invite-attention'] = `exports.invitationsChanged=()=>{};`
  return `const process={env:{NODE_ENV:'production',NEXT_PUBLIC_NEXT_STEPS_ENABLED:'true'}};
    const modules={${Object.entries(sources).map(([key,value])=>`${JSON.stringify(key)}:(module,exports,require)=>{${value}\n}`).join(',')}};
    const cache={};function require(name){if(cache[name])return cache[name].exports;const m={exports:{}};cache[name]=m;if(!modules[name])throw Error(name);modules[name](m,m.exports,require);return m.exports;}
    const React=require('react');require('react-dom/client').createRoot(document.getElementById('root')).render(React.createElement(require('workspace').NextStepWorkspace,{contact:{id:'00000000-0000-4000-8000-000000000001',name:'Invented Student'}}));`
}

test('mobile next steps: create, edit, reschedule, record, clear, errors and empty states',async t=>{
  if (!process.env.FOLLOW_UP_PLAYWRIGHT_MODULE) { t.skip('Set FOLLOW_UP_PLAYWRIGHT_MODULE to an installed Playwright module for the isolated browser check.'); return }
  const { chromium } = require(process.env.FOLLOW_UP_PLAYWRIGHT_MODULE)
  const browser = await chromium.launch({ headless: true, ...(process.env.FOLLOW_UP_BROWSER_CHANNEL ? {channel:process.env.FOLLOW_UP_BROWSER_CHANNEL} : {}) })
  t.after(()=>browser.close())
  const page = await browser.newPage({viewport:{width:390,height:844}})
  const errors=[]; page.on('pageerror',error=>errors.push(error.message))
  // A synthetic same-origin page supplies Web Crypto without any external call.
  await page.route('http://127.0.0.1:43219/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'}))
  await page.goto('http://127.0.0.1:43219/')
  const cssFolder=new URL('../../../.next/static/chunks/',import.meta.url)
  for(const file of (await readdir(cssFolder)).filter(name=>name.endsWith('.css'))) await page.addStyleTag({content:await readFile(new URL(file,cssFolder),'utf8')})
  await page.evaluate(()=>{
    window.rows=[];window.interactions=[];window.failNext=false;window.calls=[]
    window.mockRpc=async(name,args)=>{
      window.calls.push({name,args})
      if(window.failNext){window.failNext=false;return {error:{message:'Invented connection failure',code:'TEST'}}}
      if(name==='follow_up_next_steps_list')return {data:window.rows.slice()}
      if(name==='follow_up_next_step_save'){
        const step={id:args.p_id,contact_id:args.p_contact,action:args.p_action,due_at:args.p_due,version:args.p_version+1,display_name:'Invented Student',contact_status:'go_back',is_primary:true}
        window.rows=[step];return {data:step.id}
      }
      if(name==='follow_up_next_step_clear'){window.rows=[];return {data:null}}
      if(name==='follow_up_next_step_record'){window.interactions.push(args);window.rows=[];return {data:'invented-interaction'}}
      throw Error(name)
    }
  })
  await page.addScriptTag({content:await browserBundle()})
  await page.getByRole('button',{name:'+ Add my next step'}).click()
  const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10)+'T17:30'
  await page.getByLabel('My next step',{exact:true}).fill('Arrange a time to catch up')
  await page.getByLabel('When do you plan to take this step?').fill(date)
  await page.getByRole('button',{name:'Save next step',exact:true}).click()
  await page.getByRole('button',{name:'Record an interaction',exact:true}).waitFor()
  if(process.env.FOLLOW_UP_UI_SCREENSHOT) await page.screenshot({path:process.env.FOLLOW_UP_UI_SCREENSHOT,fullPage:true})
  assert.equal(await page.evaluate(()=>window.interactions.length),0,'choosing a plan never logs an interaction')
  await page.getByRole('button',{name:'Edit',exact:true}).click()
  await page.getByLabel('My next step',{exact:true}).fill('Arrange a time to talk next week')
  await page.getByRole('button',{name:'Save next step',exact:true}).click()
  await page.getByText('Arrange a time to talk next week',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Reschedule',exact:true}).click()
  assert.equal(await page.getByLabel('My next step',{exact:true}).count(),0)
  await page.getByLabel('When do you plan to take this step?').fill(date.slice(0,10)+'T18:00')
  await page.getByRole('button',{name:'Reschedule',exact:true}).click()
  await page.getByRole('button',{name:'Record an interaction',exact:true}).click()
  await page.getByLabel('Notes',{exact:true}).fill('We caught up. Invented fixture only.')
  await page.getByRole('button',{name:'Save Interaction',exact:true}).click()
  await page.getByRole('button',{name:'+ Add my next step'}).waitFor()
  assert.equal(await page.evaluate(()=>window.interactions.length),1)
  assert.equal(await page.evaluate(()=>window.interactions[0].p_payload.p_notes),'We caught up. Invented fixture only.')
  await page.getByRole('button',{name:'+ Add my next step'}).click()
  await page.getByLabel('My next step',{exact:true}).fill('Another invented plan')
  await page.getByLabel('When do you plan to take this step?').fill(date)
  await page.evaluate(()=>{window.failNext=true})
  await page.getByRole('button',{name:'Save next step',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'Invented connection failure'}).waitFor()
  await page.getByRole('button',{name:'Save next step',exact:true}).click()
  await page.getByRole('button',{name:'Clear the step',exact:true}).click()
  await page.getByRole('button',{name:'Clear step',exact:true}).click()
  await page.getByRole('button',{name:'+ Add my next step'}).waitFor()
  assert.equal(await page.evaluate(()=>window.interactions.length),1,'clearing does not log an interaction')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'fits mobile width')
  assert.deepEqual(errors,[])
})
