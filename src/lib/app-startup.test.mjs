import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'
import React from 'react'
import { renderToString } from 'react-dom/server'

const require = createRequire(import.meta.url)
const source = await readFile(new URL('../components/follow-up/app-startup.tsx', import.meta.url), 'utf8')
// Execute the actual TSX with real React; only the purely visual logo is stubbed.
const compiled = ts.transpileModule(source, { compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText
const exports = {}
Function('require', 'exports', compiled)(name => name === './app-loading'
  ? { AppLoading: () => React.createElement('div', { 'data-launch-animation': true }, 'Loading Follow Up') }
  : require(name), exports)

test('suspended initial runtime renders launch fallback, not an empty shell', () => {
  const pending = new Promise(() => {})
  function Page() { throw pending }
  const html = renderToString(React.createElement(exports.AppStartup, null, React.createElement(Page)))
  assert.match(html, /data-launch-animation/)
  assert.match(html, /data-app-startup/)
})

test('fast initial runtime does not force an artificial splash delay', () => {
  const html = renderToString(React.createElement(exports.AppStartup, null,
    React.createElement(exports.AppStartupReady, null, 'Ready immediately')))
  assert.match(html, /Ready immediately/)
  assert.doesNotMatch(html, /data-launch-animation/)
})

test('launch completion is monotonic and first-page readiness is inside page Suspense', async () => {
  assert.match(source, /useState\(false\)/)
  assert.match(source, /useCallback\(\(\) => setReady\(true\), \[\]\)/)
  assert.doesNotMatch(source, /setReady\(false\)|sessionStorage|setTimeout/)
  assert.match(source, /if \(!ready\) return/)
  assert.match(source, /aria-label="Loading page"/)
  const layout = await readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8')
  assert.match(layout, /<AppStartup>\s*<AppRuntime>/)
  assert.match(layout, /<Suspense fallback={<AppStartupFallback \/>}>\s*<AppStartupReady>{children}<\/AppStartupReady>/)
  assert.doesNotMatch(layout, /fallback={<AppLoading/)
})
