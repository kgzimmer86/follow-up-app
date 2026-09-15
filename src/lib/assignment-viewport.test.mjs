import assert from 'node:assert/strict'
import test from 'node:test'
import { observeAssignmentSelect } from './assignment-viewport.ts'

test('one viewport observer serves every row, releases removed rows, and preloads before visibility',()=>{
  const previous=globalThis.IntersectionObserver
  const instances=[]
  globalThis.IntersectionObserver=class {
    constructor(callback,options){this.callback=callback;this.options=options;this.elements=new Set();instances.push(this)}
    observe(element){this.elements.add(element)}
    unobserve(element){this.elements.delete(element)}
    disconnect(){this.disconnected=true}
  }
  const updates=[]
  try {
    const elements=Array.from({length:1000},()=>({}))
    const cleanups=elements.map((element,i)=>observeAssignmentSelect(element,near=>updates.push([i,near])))
    assert.equal(instances.length,1)
    assert.equal(instances[0].options.rootMargin,'800px 0px')
    instances[0].callback([{target:elements[0],isIntersecting:true},{target:elements[1],isIntersecting:false}])
    assert.deepEqual(updates,[[0,true],[1,false]])
    cleanups[0]()
    instances[0].callback([{target:elements[0],isIntersecting:true}])
    assert.equal(updates.length,2,'queued callback cannot update an unmounted row')
    cleanups.slice(1).forEach(cleanup=>cleanup())
    assert.equal(instances[0].elements.size,0);assert.equal(instances[0].disconnected,true)
    const cleanup=observeAssignmentSelect({},()=>{})
    assert.equal(instances.length,2,'new list starts with a fresh observer')
    cleanup()
  } finally {globalThis.IntersectionObserver=previous}
})
test('older browsers without intersection observers retain all choices',()=>{
  const previous=globalThis.IntersectionObserver
  delete globalThis.IntersectionObserver
  try {let near=false;const cleanup=observeAssignmentSelect({},value=>{near=value});assert.equal(near,true);cleanup()}
  finally {globalThis.IntersectionObserver=previous}
})
