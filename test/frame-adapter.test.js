'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { toMatchFrame } = require('../src/match-engine/frameAdapter')

function baseMatch(iterationLog) {
  return {
    matchClock: { tick: 10, minute: 0, second: 10, secondsPerTick: 1 },
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [] },
    secondTeam: { teamID: 'B', players: [] },
    kickOffTeamStatistics: { goals: 0 },
    secondTeamStatistics: { goals: 0 },
    iterationLog
  }
}

test('toMatchFrame classifies goal kick as set piece not goal', () => {
  const frame = toMatchFrame(baseMatch(['Goal Kick to - ThisTeam']))

  assert.equal(frame.events.length, 1)
  assert.equal(frame.events[0].type, 'set_piece')
})

test('toMatchFrame filters vendor debug logs from public events', () => {
  const frame = toMatchFrame(baseMatch([
    'Ball start position: 340,525,0',
    'Closest Player to ball: Aiden Smith',
    'Ball end position: 342,528,0',
    'Passed to Wayne Smith'
  ]))

  assert.equal(frame.events.length, 1)
  assert.equal(frame.events[0].type, 'pass')
})
