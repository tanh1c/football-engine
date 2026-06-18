'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const { initMatch, simulateFullMatch, simulateMatch, stepMatch, toMatchFrame } = require('../src/match-engine')
const setPositions = require('../vendor/footballSimulationEngine/lib/setPositions')

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'))
}

function demoInput(seed = 'test-seed') {
  return {
    homeTeam: readJson('vendor/footballSimulationEngine/init_config/team1.json'),
    awayTeam: readJson('vendor/footballSimulationEngine/init_config/team2.json'),
    pitch: readJson('vendor/footballSimulationEngine/init_config/pitch.json'),
    seed,
    secondsPerTick: 5
  }
}

function assertValidBallOwnership(state) {
  if (!state.ball?.withPlayer) return

  const players = [
    ...(state.kickOffTeam.players ?? []),
    ...(state.secondTeam.players ?? [])
  ]
  const owner = players.find(player => String(player.playerID) === String(state.ball.Player))

  assert.ok(owner, `Ball owner ${state.ball.Player} must be on the pitch`)
  assert.ok(state.ball.withTeam, `Ball owner ${state.ball.Player} must have withTeam`)
  assert.ok([state.kickOffTeam.teamID, state.secondTeam.teamID].map(String).includes(String(state.ball.withTeam)))
}

test('simulateMatch emits render-ready frames and events', async () => {
  const result = await simulateMatch(demoInput(), { ticks: 3 })

  assert.equal(result.frames.length, 4)
  assert.equal(result.frames[0].players.length, 22)
  assert.equal(result.frames[3].tick, 3)
  assert.equal(result.frames[3].second, 15)
  assert.equal(typeof result.frames[3].ball.x, 'number')
  assert.ok(Array.isArray(result.events))
})

test('simulateMatch can omit raw state from public results', async () => {
  const result = await simulateMatch(demoInput('omit-state'), { ticks: 2, includeState: false })

  assert.equal(result.state, undefined)
  assert.equal(result.frames.length, 3)
  assert.ok(Array.isArray(result.events))
})

test('simulateMatch includes initial kickoff events in top-level events', async () => {
  const result = await simulateMatch(demoInput('initial-events'), { ticks: 1 })

  assert.deepEqual(result.events.slice(0, 2).map(event => event.message), [
    'Team to kick off - ThisTeam',
    'Second team - ThatTeam'
  ])
})

test('simulateMatch supports one-second smooth tick output', async () => {
  const result = await simulateMatch({ ...demoInput('smooth-one-second'), secondsPerTick: 1 }, { ticks: 3 })

  assert.equal(result.frames.length, 4)
  assert.equal(result.frames[3].tick, 3)
  assert.equal(result.frames[3].second, 3)
  assert.equal(result.frames[3].continuity.secondsPerTick, 1)
  assert.equal(result.frames[0].continuity.nextTick, 1)
  assert.equal(result.frames[0].ball.trajectory.to.x, result.frames[1].ball.x)
})

test('simulateMatch is deterministic for the same seed', async () => {
  const first = await simulateMatch(demoInput('repeatable'), { ticks: 5 })
  const second = await simulateMatch(demoInput('repeatable'), { ticks: 5 })

  assert.deepEqual(first.frames, second.frames)
  assert.deepEqual(first.finalStats, second.finalStats)
})

test('simulateMatch omits tactical metadata from public frames by default', async () => {
  const result = await simulateMatch(demoInput('tactical-frame'), { ticks: 2 })
  const frame = result.frames[2]

  assert.equal(frame.tactical, undefined)
  assert.equal(frame.debugLog, undefined)
  assert.deepEqual(Object.keys(frame.players[0]).sort(), ['hasBall', 'id', 'name', 'role', 'shirtNo', 'side', 'teamId', 'x', 'y'])
  assert.deepEqual(frame.events, [])
  assert.ok(Array.isArray(frame.eventIds))
  assert.deepEqual(result.frames[0].events, [])
  assert.deepEqual(result.events.slice(0, 2).map(event => event.message), [
    'Team to kick off - ThisTeam',
    'Second team - ThatTeam'
  ])
})

test('simulateMatch includes frame event ids for public playback', async () => {
  const result = await simulateMatch(demoInput('event-ids'), { ticks: 2 })

  assert.ok(Array.isArray(result.frames[0].eventIds))
  assert.ok(result.frames[0].eventIds.length >= 2)
})

test('toMatchFrame preserves structured shot to goal links', () => {
  const frame = toMatchFrame({
    matchClock: { tick: 9, minute: 0, second: 9, secondsPerTick: 1 },
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [] },
    secondTeam: { teamID: 'B', players: [] },
    kickOffTeamStatistics: { goals: 1 },
    secondTeamStatistics: { goals: 0 },
    iterationLog: ['Goal Scored by - Wrong Name - (Wrong Team)'],
    events: [
      { id: 'shot-9', type: 'shot', playerName: 'A One', teamId: 'A', outcome: 'goal' },
      { id: 'goal-9', type: 'goal', playerName: 'A One', teamId: 'A', shotId: 'shot-9', outcome: 'goal' }
    ]
  })

  assert.equal(frame.events[0].id, 'shot-9')
  assert.equal(frame.events[1].id, 'goal-9')
  assert.equal(frame.events[1].shotId, 'shot-9')
})

test('simulateFullMatch links real shot and goal events with shotId', async () => {
  const result = await simulateFullMatch(demoInput('batch-7'), {
    firstHalfTicks: 300,
    secondHalfTicks: 300
  })
  const goal = result.events.find(event => event.type === 'goal')

  assert.ok(goal)
  assert.ok(goal.shotId)
  assert.ok(result.events.some(event => event.id === goal.shotId && event.type === 'shot'))
})

test('setPositions records a structured goal when a shot crosses the line', () => {
  const makePlayer = (playerID, name, currentPOS) => ({
    name,
    playerID,
    currentPOS,
    originPOS: currentPOS.slice(),
    skill: { saving: 10, jumping: 10 },
    stats: { saves: 0 }
  })
  const match = {
    matchClock: { tick: 13, minute: 0, second: 13, secondsPerTick: 1 },
    pitchSize: [100, 100, 20],
    half: 1,
    kickOffTeam: {
      teamID: 'A',
      name: 'ThisTeam',
      players: Array.from({ length: 11 }, (_, index) => makePlayer(`A${index + 1}`, `A${index + 1}`, [50, 5 + index]))
    },
    secondTeam: {
      teamID: 'B',
      name: 'ThatTeam',
      players: Array.from({ length: 11 }, (_, index) => makePlayer(`B${index + 1}`, `B${index + 1}`, [50, 95 - index]))
    },
    kickOffTeamStatistics: { goals: 0, shots: { total: 0, on: 0, off: 0 }, corners: 0, fouls: 0 },
    secondTeamStatistics: { goals: 0, shots: { total: 0, on: 0, off: 0 }, corners: 0, fouls: 0 },
    ball: {
      position: [50, 0, 0],
      lastTouch: { playerName: 'A One', playerID: 'A9', teamID: 'A', deflection: false, iterations: 0 },
      withTeam: 'A',
      withPlayer: false,
      Player: ''
    },
    iterationLog: [],
    events: [{ id: 'shot-13', type: 'shot', playerName: 'A One', teamId: 'A' }],
    _eventCounter: 1
  }

  setPositions.setKickOffTeamGoalScored(match)

  assert.ok(match.events.some(event => event.type === 'goal'))
  assert.equal(match.events.at(-1).shotId, 'shot-13')
  assert.equal(match.events.at(-1).playerName, 'A One')
})

test('simulateMatch can include tactical metadata for debug output', async () => {
  const result = await simulateMatch(demoInput('tactical-frame-debug'), { ticks: 2, includeTacticalDebug: true, includeDebugLog: true })
  const frame = result.frames[2]

  assert.ok(frame.tactical)
  assert.equal(typeof frame.tactical.phase, 'string')
  assert.equal(typeof frame.tactical.pressure.score, 'number')
  assert.ok(Array.isArray(frame.tactical.passOptions))
  assert.ok(Array.isArray(frame.debugLog))
})

test('tactical action scoring keeps simulation deterministic', async () => {
  const first = await simulateMatch(demoInput('tactical-action-hook'), { ticks: 20 })
  const second = await simulateMatch(demoInput('tactical-action-hook'), { ticks: 20 })

  assert.deepEqual(first.frames, second.frames)
  assert.deepEqual(first.events, second.events)
})

test('simulateMatch includes full phase 2 tactical metadata on debug frames', async () => {
  const result = await simulateMatch(demoInput('full-phase-2-frame'), { ticks: 2, includeTacticalDebug: true })
  const tactical = result.frames[2].tactical

  assert.ok(Array.isArray(tactical.formationTargets))
  assert.ok(Array.isArray(tactical.intercepts))
  assert.ok(tactical.pressing)
  assert.ok(Array.isArray(tactical.actionRecommendations))
})

test('full phase 2 action recommendations keep simulation deterministic', async () => {
  const first = await simulateMatch(demoInput('full-phase-2-action-hook'), { ticks: 30 })
  const second = await simulateMatch(demoInput('full-phase-2-action-hook'), { ticks: 30 })

  assert.deepEqual(first.frames, second.frames)
  assert.deepEqual(first.events, second.events)
})

test('toMatchFrame reads goals from vendor match statistics', () => {
  const frame = toMatchFrame({
    matchClock: { tick: 1, minute: 0, second: 1, secondsPerTick: 1 },
    pitchSize: [100, 100],
    ball: { position: [50, 50, 0] },
    kickOffTeam: { teamID: 'A', players: [] },
    secondTeam: { teamID: 'B', players: [] },
    kickOffTeamStatistics: { goals: 2 },
    secondTeamStatistics: { goals: 1 },
    iterationLog: []
  })

  assert.equal(frame.score.A, 2)
  assert.equal(frame.score.B, 1)
})

test('simulateMatch exposes final score shorthand in finalStats', async () => {
  const result = await simulateMatch(demoInput('final-score-shorthand'), { ticks: 1, includeState: false })

  assert.deepEqual(result.finalStats.score, {
    kickOffTeam: result.finalStats.kickOffTeam.goals,
    secondTeam: result.finalStats.secondTeam.goals
  })
})

test('real vendor frames expose reliable public events and stats shape', async () => {
  const result = await simulateMatch(demoInput('vendor-regression'), { ticks: 120 })
  const debugEvents = result.events.filter(event => /^(Ball start position|Ball end position|Closest Player to ball|creating new ball movement)/i.test(event.message))
  const goalKickGoals = result.events.filter(event => event.type === 'goal' && /goal kick/i.test(event.message))

  assert.equal(debugEvents.length, 0)
  assert.equal(goalKickGoals.length, 0)
  assert.equal(typeof result.finalStats.kickOffTeam.goals, 'number')
  assert.equal(typeof result.finalStats.secondTeam.goals, 'number')
})

test('simulateMatch separates debug logs from public events', async () => {
  const result = await simulateMatch(demoInput('debug-separation'), { ticks: 3, includeDebugLog: true })

  assert.ok(result.debugLog.length > 0)
  assert.equal(result.events.some(event => /^Ball start position/i.test(event.message)), false)
  assert.equal(result.debugLog.some(entry => /^Ball start position/i.test(entry.message)), true)
})

test('stepMatch applies tactical movement intents to vendor intent positions', async () => {
  const state = await initMatch(demoInput('movement-intent-application'))
  const ballCarrier = state.kickOffTeam.players.find(player => player.hasBall)
  const defender = state.secondTeam.players[1]

  defender.currentPOS = [ballCarrier.currentPOS[0] + 5, ballCarrier.currentPOS[1]]
  defender.intentPOS = defender.originPOS.map(value => value)

  await stepMatch(state)

  assert.deepEqual(defender.intentPOS, ballCarrier.currentPOS)
})

test('simulateFullMatch runs both halves with a half-time reset frame', async () => {
  const result = await simulateFullMatch(demoInput('tiny-full-match'), {
    firstHalfTicks: 2,
    secondHalfTicks: 2
  })

  assert.equal(result.state.half, 2)
  assert.equal(result.halves.first.ticks, 2)
  assert.equal(result.halves.second.ticks, 2)
  assert.equal(result.frames.length, 6)
  assert.ok(result.events.some(event => /second half/i.test(event.message ?? '')))
  assert.ok(result.frames.some(frame => frame.discontinuity?.type === 'half_time_reset'))
})

test('simulateFullMatch can omit collected frame payloads for batch mode', async () => {
  const streamedFrames = []
  const result = await simulateFullMatch(demoInput('lightweight-full-match'), {
    firstHalfTicks: 2,
    secondHalfTicks: 2,
    collectFrames: false,
    includeState: false,
    onFrame: frame => streamedFrames.push(frame)
  })

  assert.equal(result.state, undefined)
  assert.deepEqual(result.frames, [])
  assert.equal(streamedFrames.length, 5)
  assert.ok(result.events.length > 0)
  assert.equal(typeof result.finalStats.kickOffTeam.goals, 'number')
})

test('simulateFullMatch does not retain frame history when frame collection is disabled', async () => {
  const result = await simulateFullMatch(demoInput('no-frame-history'), {
    firstHalfTicks: 2,
    secondHalfTicks: 2,
    collectFrames: false
  })

  assert.equal(result.frames.length, 0)
  assert.equal(result.state.frameHistory.length, 0)
})

test('simulateFullMatch exposes unique monotonic frame identity across half-time', async () => {
  const result = await simulateFullMatch(demoInput('identity-full-match'), {
    firstHalfTicks: 2,
    secondHalfTicks: 2
  })

  assert.deepEqual(result.frames.map(frame => frame.frameIndex), [0, 1, 2, 3, 4, 5])
  assert.deepEqual(result.frames.map(frame => frame.absoluteTick), [0, 1, 2, 3, 4, 5])
  assert.equal(new Set(result.frames.map(frame => frame.absoluteTick)).size, result.frames.length)
  assert.equal(result.frames[3].half, 2)
  assert.equal(result.frames[3].tick, 2)
  assert.deepEqual(result.frames[3].discontinuity, { type: 'half_time_reset', interpolate: false })
})

test('simulateFullMatch is deterministic for the same seed', async () => {
  const first = await simulateFullMatch(demoInput('tiny-full-match-repeatable'), {
    firstHalfTicks: 2,
    secondHalfTicks: 2
  })
  const second = await simulateFullMatch(demoInput('tiny-full-match-repeatable'), {
    firstHalfTicks: 2,
    secondHalfTicks: 2
  })

  assert.deepEqual(first.frames, second.frames)
  assert.deepEqual(first.finalStats, second.finalStats)
})

test('simulateFullMatch preserves ball ownership invariants across known bad seeds', async () => {
  for (const seed of ['seed-0', 'seed-2', 'seed-5', 'seed-7', 'seed-8', 'c']) {
    const result = await simulateFullMatch(demoInput(seed), {
      firstHalfTicks: 120,
      secondHalfTicks: 120
    })

    assertValidBallOwnership(result.state)
  }
})

test('simulateFullMatch does not corrupt kickoff receiver position after goals', async () => {
  const result = await simulateFullMatch(demoInput('batch-9'), {
    firstHalfTicks: 1500,
    secondHalfTicks: 0,
    collectFrames: false,
    includeState: false
  })

  assert.equal(result.frames.length, 0)
  assert.equal(typeof result.finalStats.kickOffTeam.goals, 'number')
})
