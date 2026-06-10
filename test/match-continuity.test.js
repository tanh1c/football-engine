'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { addFrameContinuity } = require('../src/match-engine/continuity')

test('addFrameContinuity links neighboring ticks', () => {
  const frames = addFrameContinuity([
    { tick: 0, ball: { x: 1, y: 2, z: 0 }, continuity: { secondsPerTick: 1 } },
    { tick: 1, ball: { x: 3, y: 4, z: 0 }, continuity: { secondsPerTick: 1 } }
  ])

  assert.equal(frames[0].continuity.previousTick, undefined)
  assert.equal(frames[0].continuity.nextTick, 1)
  assert.equal(frames[1].continuity.previousTick, 0)
  assert.equal(frames[1].continuity.nextTick, undefined)
})

test('addFrameContinuity derives ball trajectory from neighboring frames', () => {
  const frames = addFrameContinuity([
    { tick: 0, ball: { x: 1, y: 2, z: 0 }, continuity: { secondsPerTick: 1 } },
    { tick: 1, ball: { x: 3, y: 4, z: 5 }, continuity: { secondsPerTick: 1 } }
  ])

  assert.deepEqual(frames[0].ball.trajectory, {
    from: { x: 1, y: 2, z: 0 },
    to: { x: 3, y: 4, z: 5 },
    reason: 'frame_delta'
  })
})
