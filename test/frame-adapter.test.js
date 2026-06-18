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

test('toMatchFrame preserves set-piece logs alongside structured events', () => {
  const match = baseMatch(['Foul against: B Nine', 'freekick to: B'])
  match.matchClock = { tick: 4, minute: 0, second: 4, secondsPerTick: 1 }
  match.events = [{ id: 'foul-4', tick: 4, type: 'foul', message: 'Foul against: B Nine' }]

  const frame = toMatchFrame(match)

  assert.deepEqual(frame.events.map(event => event.type), ['foul', 'set_piece'])
})

test('toMatchFrame parses freekick set pieces without leaking coordinates into teamName', () => {
  const frame = toMatchFrame(baseMatch(['freekick to: ThatTeam [358,511,2]']))

  assert.equal(frame.events[0].type, 'set_piece')
  assert.equal(frame.events[0].kind, 'free_kick')
  assert.equal(frame.events[0].teamName, 'ThatTeam')
  assert.deepEqual(frame.events[0].position, { x: 358, y: 511 })
})

test('toMatchFrame prefers structured events over parsed iteration logs', () => {
  const match = baseMatch(['Shot Made by: Wrong Name'])
  match.events = [{
    id: 'shot-1',
    tick: 7,
    type: 'shot',
    playerId: 'A1',
    playerName: 'A One',
    teamId: 'A',
    xg: 0.22,
    outcome: 'saved',
    message: 'A One shoots.',
    commentaryText: 'A One shoots.'
  }]
  match.matchClock = { tick: 7, minute: 0, second: 7, secondsPerTick: 1 }

  const frame = toMatchFrame(match)

  assert.equal(frame.events.length, 1)
  assert.equal(frame.events[0].id, 'shot-1')
  assert.equal(frame.events[0].playerName, 'A One')
  assert.equal(frame.events[0].outcome, 'saved')
})

test('toMatchFrame only includes structured events for the current tick', () => {
  const match = baseMatch([])
  match.matchClock = { tick: 8, minute: 0, second: 8, secondsPerTick: 1 }
  match.events = [
    { id: 'shot-7', tick: 7, type: 'shot', playerName: 'A One' },
    { id: 'pass-8', tick: 8, type: 'pass', playerName: 'A Two' }
  ]

  const frame = toMatchFrame(match)

  assert.deepEqual(frame.events.map(event => event.id), ['pass-8'])
})

test('toMatchFrame falls back to current iteration logs when structured events are from older ticks', () => {
  const match = baseMatch(['ball passed by: A Two'])
  match.matchClock = { tick: 8, minute: 0, second: 8, secondsPerTick: 1 }
  match.events = [{ id: 'shot-7', tick: 7, type: 'shot', playerName: 'A One' }]

  const frame = toMatchFrame(match)

  assert.equal(frame.events.length, 1)
  assert.equal(frame.events[0].type, 'pass')
  assert.equal(frame.events[0].playerName, 'A Two')
})

test('toMatchFrame attaches possessed ball to owner position when vendor ball position is stale', () => {
  const match = baseMatch([])
  match.ball = {
    position: [50, 50, 0],
    Player: 'A1',
    withTeam: 'A'
  }
  match.kickOffTeam.players = [{
    playerID: 'A1',
    name: 'A One',
    currentPOS: [42, 61],
    originPOS: [50, 50],
    hasBall: true
  }]

  const frame = toMatchFrame(match)

  assert.equal(frame.ball.x, 42)
  assert.equal(frame.ball.y, 61)
  assert.equal(frame.ball.ownerPlayerId, 'A1')
})

test('toMatchFrame attaches shot xG from pre-action context', () => {
  const frame = toMatchFrame(baseMatch(['Shot Made by: A One']), {
    phase: 'transition',
    pressure: { score: 0.5 },
    shotQuality: undefined
  }, {
    preActionContext: {
      ballOwnerName: 'A One',
      shotQuality: { xg: 0.17 },
      pressure: { score: 0.2 },
      phase: 'final_third'
    }
  })

  assert.equal(frame.events[0].type, 'shot')
  assert.equal(frame.events[0].xg, 0.17)
  assert.equal(frame.events[0].pressure, 0.2)
  assert.equal(frame.events[0].phase, 'final_third')
})

test('toMatchFrame filters technical vendor messages from public events', () => {
  const frame = toMatchFrame(baseMatch([
    'ball passed by: A One',
    'Target selected: B Two',
    'passed to new position: 339,528,0'
  ]))

  assert.deepEqual(frame.events.map(event => event.message), ['ball passed by: A One'])
})

test('toMatchFrame adds readable commentary text for public events', () => {
  const frame = toMatchFrame(baseMatch([
    'ball passed by: A One',
    'Shot Made by: A One',
    'Goal Scored by - A One - (ThisTeam)'
  ]))

  assert.deepEqual(frame.events.map(event => event.commentaryText), [
    'A One plays a pass.',
    'A One shoots.',
    'Goal for ThisTeam!'
  ])
})

test('toMatchFrame generates contextual commentary from structured progression events', () => {
  const frame = toMatchFrame({
    matchClock: { tick: 12, minute: 0, second: 12, secondsPerTick: 1 },
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [] },
    secondTeam: { teamID: 'B', players: [] },
    kickOffTeamStatistics: { goals: 0 },
    secondTeamStatistics: { goals: 0 },
    iterationLog: [],
    events: [
      { id: 'pass-1', tick: 12, type: 'pass', fromPlayerName: 'A One', toPlayerName: 'A Two', passType: 'pass' },
      { id: 'through-1', tick: 12, type: 'through_ball', fromPlayerName: 'A Three', toPlayerName: 'A Four', passType: 'through_ball' },
      { id: 'cross-1', tick: 12, type: 'cross', fromPlayerName: 'A Five', passType: 'cross' },
      { id: 'long-1', tick: 12, type: 'long_ball', fromPlayerName: 'A Six', toPlayerName: 'A Seven', passType: 'long_ball' },
      { id: 'switch-1', tick: 12, type: 'switch_play', fromPlayerName: 'A Eight', toPlayerName: 'A Nine', passType: 'switch_play' },
      { id: 'save-1', tick: 12, type: 'save', playerName: 'Keeper' }
    ]
  })

  assert.deepEqual(frame.events.map(event => event.commentaryText), [
    'A One looks for A Two.',
    'A Three tries to slide A Four through.',
    'A Five swings a cross into the area.',
    'A Six goes long towards A Seven.',
    'A Eight switches play to A Nine.',
    'Keeper makes the save.'
  ])
})

test('toMatchFrame preserves structured pass and foul fields', () => {
  const frame = toMatchFrame({
    matchClock: { tick: 12, minute: 0, second: 12, secondsPerTick: 1 },
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [] },
    secondTeam: { teamID: 'B', players: [] },
    kickOffTeamStatistics: { goals: 0 },
    secondTeamStatistics: { goals: 0 },
    iterationLog: ['ball passed by: Wrong Parser', 'Foul against: Wrong Parser'],
    events: [
      { id: 'pass-1', type: 'pass', playerName: 'A One', teamId: 'A', targetPlayerId: 'A2' },
      { id: 'foul-1', type: 'foul', playerName: 'B Two', teamId: 'B', outcome: 'foul' }
    ]
  })

  assert.equal(frame.events[0].id, 'pass-1')
  assert.equal(frame.events[0].type, 'pass')
  assert.equal(frame.events[0].playerName, 'A One')
  assert.equal(frame.events[0].targetPlayerId, 'A2')
  assert.equal(frame.events[1].id, 'foul-1')
  assert.equal(frame.events[1].type, 'foul')
  assert.equal(frame.events[1].playerName, 'B Two')
})

test('toMatchFrame preserves structured shot xG instead of overwriting from pre-action context', () => {
  const match = baseMatch([])
  match.matchClock = { tick: 18, minute: 0, second: 18, secondsPerTick: 1 }
  match.events = [{ id: 'shot-1', tick: 18, type: 'shot', playerName: 'A One', xg: 0.42, phase: 'final_third', pressure: 0.1 }]

  const frame = toMatchFrame(match, { phase: 'midfield', pressure: { score: 0.8 }, shotQuality: { xg: 0.03 } }, {
    preActionContext: {
      ballOwnerName: 'A One',
      shotQuality: { xg: 0.17 },
      pressure: { score: 0.2 },
      phase: 'transition'
    }
  })

  assert.equal(frame.events[0].xg, 0.42)
  assert.equal(frame.events[0].phase, 'final_third')
  assert.equal(frame.events[0].pressure, 0.1)
})

test('toMatchFrame gives linked goals the original shot context', () => {
  const match = baseMatch([])
  match.matchClock = { tick: 18, minute: 0, second: 18, secondsPerTick: 1 }
  match.events = [
    { id: 'shot-1', tick: 17, type: 'shot', playerName: 'A One', xg: 0.42, phase: 'final_third', pressure: 0.1 },
    { id: 'goal-1', tick: 18, type: 'goal', playerName: 'A One', shotId: 'shot-1' }
  ]

  const frame = toMatchFrame(match, { phase: 'midfield', pressure: { score: 0.8 }, shotQuality: { xg: 0.03 } })

  assert.equal(frame.events[0].type, 'goal')
  assert.equal(frame.events[0].shotId, 'shot-1')
  assert.equal(frame.events[0].xg, 0.42)
  assert.equal(frame.events[0].phase, 'final_third')
  assert.equal(frame.events[0].pressure, 0.1)
})

test('toMatchFrame does not synthesize terminal shot events from logs when structured history exists', () => {
  const match = baseMatch(['ball saved by Wrong Keeper possesion to Wrong Team', 'Goal Scored by - Wrong Name - (Wrong Team)', 'ball passed by: A One'])
  match.matchClock = { tick: 12, minute: 0, second: 12, secondsPerTick: 1 }
  match.events = [{ id: 'shot-10', tick: 10, type: 'shot', playerName: 'A Nine', teamId: 'A', outcome: 'pending' }]

  const frame = toMatchFrame(match)

  assert.deepEqual(frame.events.map(event => event.type), ['pass'])
})

test('toMatchFrame classifies save logs as save events', () => {
  const frame = toMatchFrame(baseMatch(['ball saved by Keeper possesion to Defence']))

  assert.equal(frame.events[0].type, 'save')
  assert.equal(frame.events[0].playerName, 'Keeper')
  assert.equal(frame.events[0].teamName, 'Defence')
  assert.equal(frame.events[0].commentaryText, 'Keeper makes the save.')
})

test('toMatchFrame prefers structured save events over save logs', () => {
  const match = baseMatch(['ball saved by Wrong Keeper possesion to Wrong Team'])
  match.events = [{ id: 'save-1', tick: 10, type: 'save', playerName: 'Keeper', teamName: 'Defence', shotId: 'shot-1', xg: 0.2 }]

  const frame = toMatchFrame(match)

  assert.equal(frame.events.length, 1)
  assert.equal(frame.events[0].id, 'save-1')
  assert.equal(frame.events[0].playerName, 'Keeper')
  assert.equal(frame.events[0].shotId, 'shot-1')
})
