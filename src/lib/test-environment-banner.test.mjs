import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const { renderToStaticMarkup } = require('react-dom/server')
const code = ts.transpileModule(readFileSync(new URL('../components/follow-up/test-environment-banner.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function render(environment) {
  const testModule = { exports: {} }
  vm.runInNewContext(code, { module: testModule, exports: testModule.exports, require, process: { env: { VERCEL_ENV: environment, NODE_ENV: 'production' } } })
  return renderToStaticMarkup(testModule.exports.TestEnvironmentBanner())
}

test('Preview builds display an accessible test warning without claiming database isolation', () => {
  const html = render('preview')
  assert.match(html, /aria-label="Test environment"/)
  assert.match(html, /TEST ENVIRONMENT/)
  assert.match(html, /Do not enter real student information/)
})

test('Production, local and unspecified environments render no banner or layout space', () => {
  for (const environment of ['production', 'development', undefined, '']) {
    assert.equal(render(environment), '')
  }
})
