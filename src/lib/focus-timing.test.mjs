import assert from 'node:assert/strict'
import test from 'node:test'
import { eventDeliveryDelay, focusTimingSummary } from './focus-timing.ts'

test('event delays handle monotonic and older epoch-style timestamps',()=>{
  assert.equal(eventDeliveryDelay(100,4100,1700000000000),4000)
  assert.equal(eventDeliveryDelay(1700000000100,4100,1700000000000),4000)
  assert.equal(eventDeliveryDelay(0,4100,1700000000000),null)
  assert.equal(eventDeliveryDelay(4200,4100,1700000000000),null)
})
test('report separates delayed event delivery from time between tap and focus',()=>{
  const summary=focusTimingSummary([
    {event:'pointerdown',atMs:0,deliveryDelayMs:4000},
    {event:'focusin',atMs:5,deliveryDelayMs:0},
  ],4010)
  assert.equal(summary.tapToFocusMs,5)
  assert.equal(summary.maxEventDeliveryDelayMs,4000)
  assert.equal(summary.maxFrameGapMs,4010)
  assert.equal(focusTimingSummary([{event:'touchstart',atMs:0,deliveryDelayMs:0}],5000).tapToFocusMs,null)
})
