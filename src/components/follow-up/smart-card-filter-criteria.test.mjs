import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { smartCardCriteria } from '../../lib/contact-filters.ts'

const filename = fileURLToPath(new URL('./smart-card-filter-criteria.tsx', import.meta.url))
const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
})
const compiled = { exports: {} }
new Function('require', 'module', 'exports', outputText)(createRequire(import.meta.url), compiled, compiled.exports)
const titles = { gospel: 'Share the Gospel', cg: 'Invite to CG', goback: 'Go Back' }
const render = (view) => renderToStaticMarkup(createElement(compiled.exports.SmartCardFilterCriteria, { title: titles[view] ?? view, criteria: smartCardCriteria(view) }))

test('Criteria use familiar card names instead of smart-card terminology', () => {
  for (const [view, title] of Object.entries(titles)) {
    assert.ok(render(view).includes(`${title} Criteria`))
    assert.doesNotMatch(render(view), /Smart-card|smart card/)
  }
})

test('Gospel displays every existing rule and explicit OR without submitting fixed values', () => {
  const html = render('gospel')
  for (const label of ['KGP shared: No', 'Jesus', 'Interview', 'OR', 'AND', 'Either section qualifies']) {
    assert.ok(html.includes(label), label)
  }
  assert.equal((html.match(/>Yes</g) ?? []).length, 2)
  assert.equal((html.match(/>Maybe</g) ?? []).length, 2)
  assert.doesNotMatch(html, /<(input|select|button)\b/)
})

test('Community uses its existing criteria, not Gospel criteria', () => {
  const html = render('cg')
  assert.match(html, /Community/)
  assert.doesNotMatch(html, /Status: excludes Not Interested/)
  assert.equal((html.match(/>Yes</g) ?? []).length, 1)
  assert.equal((html.match(/>Maybe</g) ?? []).length, 1)
  assert.doesNotMatch(html, /KGP|Interview|>OR</)
})

test('Other cards retain every rule; ordinary area view has no fixed section', () => {
  for (const view of ['mine', 'goback', 'new', 'noaddress']) {
    const html = render(view)
    for (const criterion of smartCardCriteria(view).filter(item => !item.startsWith('Status:'))) assert.ok(html.includes(criterion), criterion)
  }
  assert.equal(render('area'), '')
})

test('Disclosure keeps existing controls in the same automatic form', () => {
  const page = readFileSync(new URL('./contact-results-page.tsx', import.meta.url), 'utf8')
  const form = page.slice(page.indexOf('<AutomaticFilterForm'), page.indexOf('</AutomaticFilterForm>'))
  const disclosure = form.indexOf('{extendedFilters && <details')
  for (const name of ['campus', 'location', 'floor', 'wing', 'gender', 'status', 'affinity']) {
    assert.ok(form.indexOf(`name="${name}"`) < disclosure, name)
  }
  for (const name of ['jesus', 'community', 'interview', 'kgp', 'interviewDone', 'invitedCg', 'roomOnly']) {
    assert.ok(form.indexOf(`name="${name}"`) > disclosure, name)
  }
  assert.match(form, /Narrow further/)
  assert.ok(form.includes('Narrow the ${criteriaTitle} results by area, gender, status and affinity.'))
  assert.match(form, /SmartCardFilterCriteria title=\{criteriaTitle\}/)
  assert.doesNotMatch(form, /Narrow the smart-card/)
  assert.doesNotMatch(page, /Narrow this list by location|More filters, added to the rules above|Filters apply automatically\. Any means/)
  assert.doesNotMatch(form, /Show contacts/)
})

test('checkbox dropdown renders locked status disabled and unchecked', () => {
  const source = readFileSync(new URL('./checkbox-filter-dropdown.tsx', import.meta.url), 'utf8')
  const result = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } })
  const loaded = { exports: {} }
  new Function('require','module','exports',result.outputText)(createRequire(import.meta.url),loaded,loaded.exports)
  const html = renderToStaticMarkup(createElement(loaded.exports.CheckboxFilterDropdown, {
    label:'Status',name:'status',selected:['go_back','not_interested'],options:[
      {value:'go_back',label:'Go back'}, {value:'not_interested',label:'Not interested',locked:true},
    ],
  }))
  assert.match(html, /disabled=""[^>]*name="status"[^>]*value="not_interested"|name="status"[^>]*disabled=""[^>]*value="not_interested"/)
  assert.match(html, /Locked: excluded from this list/)
  assert.match(html, /list-none/)
  assert.match(html, /webkit-details-marker/)
  assert.match(html, /justify-between/)
  assert.match(html, /<svg aria-hidden="true"/)
  assert.doesNotMatch(html, /checked=""[^>]*value="not_interested"/)
})

test('assigned area appears once and checkbox changes retain the automatic delay', () => {
  const form = readFileSync(new URL('./automatic-filter-form.tsx', import.meta.url), 'utf8')
  assert.equal((form.match(/Use my assigned area/g) ?? []).length,1)
  assert.match(form, /'status', 'affinity'/)
  assert.match(form, /scheduleUpdate\(isSurvey \? 750 : 250\)/)
})
