'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

async function loadModule() {
  return import('../src/viewer/interpolate.js')
}

async function loadEventModule() {
  return import('../src/viewer/events.js')
}

test('interpolateFrame blends player and ball positions', async () => {
  const { interpolateFrame } = await loadModule()
  const frame = interpolateFrame({
    tick: 0,
    minute: 0,
    second: 0,
    pitch: { width: 100, height: 100 },
    ball: { x: 0, y: 0, z: 0 },
    players: [{ id: 'A1', x: 0, y: 0 }],
    events: []
  }, {
    tick: 1,
    minute: 0,
    second: 1,
    pitch: { width: 100, height: 100 },
    ball: { x: 10, y: 20, z: 4 },
    players: [{ id: 'A1', x: 10, y: 20 }],
    events: []
  }, 0.5)

  assert.equal(frame.ball.x, 5)
  assert.equal(frame.ball.y, 10)
  assert.equal(frame.ball.z, 2)
  assert.equal(frame.players[0].x, 5)
  assert.equal(frame.players[0].y, 10)
  assert.equal(frame.second, 0.5)
})

test('interpolateFrame falls back when next player is missing', async () => {
  const { interpolateFrame } = await loadModule()
  const frame = interpolateFrame({
    tick: 0,
    minute: 0,
    second: 0,
    pitch: { width: 100, height: 100 },
    ball: { x: 0, y: 0, z: 0 },
    players: [{ id: 'A1', x: 7, y: 8 }],
    events: []
  }, {
    tick: 1,
    minute: 0,
    second: 1,
    pitch: { width: 100, height: 100 },
    ball: { x: 0, y: 0, z: 0 },
    players: [],
    events: []
  }, 0.5)

  assert.equal(frame.players[0].x, 7)
  assert.equal(frame.players[0].y, 8)
})

test('playheadDelta converts speed labels to match-time playback rate', async () => {
  const { playheadDelta } = await loadModule()

  assert.equal(playheadDelta(1, 1), 10)
  assert.equal(playheadDelta(0.5, 2), 10)
  assert.equal(playheadDelta(4, 0.25), 10)
})

test('playbackSpeedLabel reports effective match-time speed', async () => {
  const { playbackSpeedLabel } = await loadModule()

  assert.equal(playbackSpeedLabel(1), '10x')
  assert.equal(playbackSpeedLabel(2), '20x')
})

test('interpolateFrame eases large loose-ball deltas with an arc', async () => {
  const { interpolateFrame } = await loadModule()
  const frame = interpolateFrame({
    tick: 0,
    minute: 0,
    second: 0,
    pitch: { width: 100, height: 100 },
    ball: { x: 0, y: 0, z: 0 },
    players: [],
    events: []
  }, {
    tick: 1,
    minute: 0,
    second: 1,
    pitch: { width: 100, height: 100 },
    ball: { x: 50, y: 0, z: 0 },
    players: [],
    events: []
  }, 0.5)

  assert.equal(frame.ball.x, 25)
  assert.ok(frame.ball.z > 0)
})

test('interpolateFrame attaches ball to interpolated receiver after possession changes', async () => {
  const { interpolateFrame } = await loadModule()
  const frame = interpolateFrame({
    tick: 0,
    minute: 0,
    second: 0,
    pitch: { width: 100, height: 100 },
    ball: { x: 0, y: 0, z: 0 },
    players: [{ id: 'A1', x: 0, y: 0, hasBall: false }],
    events: []
  }, {
    tick: 1,
    minute: 0,
    second: 1,
    pitch: { width: 100, height: 100 },
    ball: { x: 50, y: 0, z: 0, ownerPlayerId: 'A1' },
    players: [{ id: 'A1', x: 20, y: 10, hasBall: true }],
    events: []
  }, 0.75)

  assert.equal(frame.ball.x, 15)
  assert.equal(frame.ball.y, 7.5)
  assert.equal(frame.ball.ownerPlayerId, 'A1')
})

test('interpolateFrame cuts directly to discontinuity frames', async () => {
  const { interpolateFrame } = await loadModule()
  const frame = interpolateFrame({
    tick: 1,
    minute: 0,
    second: 1,
    pitch: { width: 100, height: 100 },
    ball: { x: 10, y: 10, z: 0 },
    players: [{ id: 'A1', x: 10, y: 10 }],
    events: []
  }, {
    tick: 2,
    minute: 0,
    second: 2,
    pitch: { width: 100, height: 100 },
    discontinuity: { type: 'set_piece_reset', interpolate: false },
    ball: { x: 90, y: 90, z: 0 },
    players: [{ id: 'A1', x: 90, y: 90 }],
    events: []
  }, 0.25)

  assert.equal(frame.players[0].x, 90)
  assert.equal(frame.ball.x, 90)
})

test('eventsForFrame joins optimized frame eventIds with top-level events', async () => {
  const { eventsForFrame } = await loadEventModule()
  const frame = { tick: 2, eventIds: ['pass-1', 'save-1'], events: [] }
  const events = [
    { id: 'pass-1', type: 'pass', message: 'Pass' },
    { id: 'shot-1', type: 'shot', message: 'Shot' },
    { id: 'save-1', type: 'save', message: 'Save' }
  ]

  assert.deepEqual(eventsForFrame(frame, events).map(event => event.id), ['pass-1', 'save-1'])
})

test('latestEventMessages returns cumulative commentary up to the current frame tick', async () => {
  const { eventsUpToTick, latestEventMessages } = await loadEventModule()
  const events = [
    { tick: 2, message: 'Kick off' },
    { tick: 8, message: 'Shot', commentaryText: 'A One shoots.' },
    { tick: 12, message: 'Goal' }
  ]

  assert.deepEqual(eventsUpToTick(events, 8.9).map(event => event.message), ['Kick off', 'Shot'])
  assert.deepEqual(latestEventMessages(events, 8.9), ['Kick off', 'A One shoots.'])
})
