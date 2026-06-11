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

test('toMatchFrame preserves vendor debug logs separately from public events', () => {
  const frame = toMatchFrame(baseMatch([
    'Ball start position: 340,525,0',
    'Closest Player to ball: Aiden Smith',
    'Goal Scored by - Wayne Smith - (ThatTeam)'
  ]))

  assert.deepEqual(frame.debugLog.map(entry => entry.message), [
    'Ball start position: 340,525,0',
    'Closest Player to ball: Aiden Smith'
  ])
  assert.equal(frame.events.length, 1)
})

test('toMatchFrame adds structured fields for parseable public events', () => {
  const frame = toMatchFrame(baseMatch([
    'Goal Scored by - Wayne Smith - (ThatTeam)',
    'ball passed by: Alex Jones',
    'Shot Made by: Aiden Smith'
  ]))

  assert.deepEqual(frame.events.map(event => ({ type: event.type, playerName: event.playerName, teamName: event.teamName, outcome: event.outcome })), [
    { type: 'goal', playerName: 'Wayne Smith', teamName: 'ThatTeam', outcome: 'goal' },
    { type: 'pass', playerName: 'Alex Jones', teamName: undefined, outcome: undefined },
    { type: 'shot', playerName: 'Aiden Smith', teamName: undefined, outcome: undefined }
  ])
})
