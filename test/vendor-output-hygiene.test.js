'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const common = require('../vendor/footballSimulationEngine/lib/common')
const setPositions = require('../vendor/footballSimulationEngine/lib/setPositions')
const { ballCrossed, ballPassed, checkGoalScored, moveBall, resolveDeflection, setBallMovementMatchDetails, setDeflectionPlayerHasBall, shotMade, thisPlayerIsInProximity } = require('../vendor/footballSimulationEngine/lib/ballMovement')
const { setPostTackleBall } = require('../vendor/footballSimulationEngine/lib/actions')
const { handleBallPlayerActions, movePlayers, setClosePlayerTakesBall } = require('../vendor/footballSimulationEngine/lib/playerMovement')

function player(overrides = {}) {
  return {
    playerID: 'A1',
    name: 'A One',
    position: 'ST',
    originPOS: [20, 80],
    currentPOS: [20, 80],
    height: 180,
    skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 80, control: 80, perception: 80 },
    stats: { goals: 0, shots: { total: 0, on: 0, off: 0 }, passes: { total: 0 }, tackles: { total: 0, on: 0, off: 0, fouls: 0 }, saves: 0 },
    ...overrides
  }
}

function team(name, teamID, players) {
  return { name, teamID, players }
}

function stats() {
  return { goals: 0, shots: { total: 0, on: 0, off: 0 }, corners: 0, freekicks: 0, penalties: 0, fouls: 0 }
}

function withRandomSequence(values, run) {
  let index = 0
  common.setRandomSource(() => values[index++] ?? 0.99)
  try {
    return run()
  } finally {
    common.setRandomSource()
  }
}

test('goal reset keeps kickoff receiver position two-dimensional after repeated resets', () => {
  const receiver = player({ playerID: 'A10', currentPOS: [50, 50], originPOS: [50, 50] })
  const waiting = player({ playerID: 'A11', currentPOS: [70, 50], originPOS: [70, 50] })
  const concedingTeam = team('Attack', 'A', [
    player({ playerID: 'A1', position: 'GK' }),
    ...Array.from({ length: 8 }, (_, index) => player({ playerID: `A${index + 2}` })),
    receiver,
    waiting
  ])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    ball: { position: [50, 50, 0], lastTouch: {}, ballOverIterations: [] },
    kickOffTeam: concedingTeam,
    secondTeam: team('Defence', 'B', Array.from({ length: 11 }, (_, index) => player({ playerID: `B${index + 1}` }))),
    iterationLog: []
  }

  withRandomSequence([0, 0], () => {
    setPositions.setBallSpecificGoalScoreValue(matchDetails, concedingTeam)
    setPositions.setBallSpecificGoalScoreValue(matchDetails, concedingTeam)
  })

  assert.deepEqual(receiver.currentPOS, [50, 50])
})

test('common boundary clamps preserve in-range values', () => {
  assert.equal(common.upToMax(50, 100), 50)
  assert.equal(common.upToMax(150, 100), 100)
  assert.equal(common.upToMin(50, 0), 50)
  assert.equal(common.upToMin(-5, 0), 0)
})

test('ballCrossed chooses right-side target bands for right-side crosses', () => {
  const crosser = player({
    playerID: 'A7',
    name: 'Crosser',
    originPOS: [90, 80],
    currentPOS: [90, 70],
    skill: { strength: 100, jumping: 70, passing: 80, crossing: 100 },
    height: 180
  })
  const attackingTeam = team('A', 'A', [crosser])
  const matchDetails = {
    pitchSize: [100, 100],
    matchClock: { tick: 4, minute: 0, second: 4 },
    ball: {
      position: [90, 70, 0],
      lastTouch: {},
      ballOverIterations: []
    },
    kickOffTeam: attackingTeam,
    secondTeam: team('B', 'B', []),
    iterationLog: []
  }

  withRandomSequence([0.5, 0.5, 0.5, 0.5], () => {
    ballCrossed(matchDetails, attackingTeam, crosser)
  })

  const cross = matchDetails.events.find(event => event.type === 'cross')
  assert.equal(cross.end.x >= 40, true)
})

test('ballCrossed emits structured cross event with start and end positions', () => {
  const crosser = player({
    playerID: 'A7',
    name: 'Crosser',
    originPOS: [10, 80],
    currentPOS: [10, 70],
    skill: { strength: 100, jumping: 70, passing: 80, crossing: 100 },
    height: 180
  })
  const attackingTeam = team('A', 'A', [crosser])
  const matchDetails = {
    pitchSize: [100, 100],
    matchClock: { tick: 4, minute: 0, second: 4 },
    ball: {
      position: [10, 70, 0],
      lastTouch: {},
      ballOverIterations: []
    },
    kickOffTeam: attackingTeam,
    secondTeam: team('B', 'B', []),
    iterationLog: []
  }

  withRandomSequence([0.5, 0.5, 0.5, 0.5], () => {
    ballCrossed(matchDetails, attackingTeam, crosser)
  })

  const cross = matchDetails.events.find(event => event.type === 'cross')
  assert.equal(cross.fromPlayerId, 'A7')
  assert.equal(cross.fromPlayerName, 'Crosser')
  assert.equal(cross.passType, 'cross')
  assert.deepEqual(cross.start, { x: 10, y: 70 })
  assert.equal(Number.isFinite(cross.end.x), true)
  assert.equal(Number.isFinite(cross.end.y), true)
})

test('ballCrossed does not print raw target coordinates', () => {
  const matchDetails = {
    pitchSize: [100, 100],
    ball: {
      position: [20, 80, 0],
      lastTouch: {},
      ballOverIterations: []
    },
    kickOffTeam: { name: 'A', teamID: 'A', players: [player()] },
    secondTeam: { name: 'B', teamID: 'B', players: [player()] },
    iterationLog: []
  }
  const messages = []
  const originalLog = console.log
  console.log = message => messages.push(message)

  try {
    ballCrossed(matchDetails, matchDetails.kickOffTeam, matchDetails.kickOffTeam.players[0])

    assert.deepEqual(messages, [])
  } finally {
    console.log = originalLog
  }
})

test('ballPassed emits structured pass event with target and positions', () => {
  const passer = player({
    playerID: 'A1',
    name: 'Passer',
    skill: { strength: 100, jumping: 70, passing: 100, crossing: 80 },
    height: 180
  })
  const target = player({ playerID: 'A2', name: 'Target', position: [40, 80], currentPOS: [40, 80], originPOS: [40, 80], isMarked: false })
  const attackingTeam = team('A', 'A', [passer, target])
  const matchDetails = {
    pitchSize: [100, 100],
    matchClock: { tick: 5, minute: 0, second: 5 },
    ball: {
      position: [20, 80, 0],
      lastTouch: {},
      ballOverIterations: []
    },
    kickOffTeam: attackingTeam,
    secondTeam: team('B', 'B', []),
    iterationLog: []
  }

  ballPassed(matchDetails, attackingTeam, passer)

  const pass = matchDetails.events.find(event => event.type === 'pass')
  assert.equal(pass.fromPlayerId, 'A1')
  assert.equal(pass.fromPlayerName, 'Passer')
  assert.equal(pass.toPlayerId, 'A2')
  assert.equal(pass.toPlayerName, 'Target')
  assert.deepEqual(pass.start, { x: 20, y: 80 })
  assert.deepEqual(pass.target, { x: 40, y: 80 })
  assert.deepEqual(pass.end, { x: 40, y: 80 })
  assert.equal(pass.outcome, 'attempted')
})

test('ballPassed classifies very long generic passes as long balls', () => {
  const passer = player({
    playerID: 'A1',
    name: 'Passer',
    originPOS: [340, 900],
    currentPOS: [340, 900],
    skill: { strength: 100, jumping: 70, passing: 100, crossing: 80 },
    height: 180
  })
  const target = player({ playerID: 'A2', name: 'Target', position: 'ST', currentPOS: [340, 240], originPOS: [340, 240], isMarked: false })
  const attackingTeam = team('A', 'A', [passer, target])
  const matchDetails = {
    pitchSize: [680, 1050],
    matchClock: { tick: 5, minute: 0, second: 5 },
    ball: {
      position: [340, 900, 0],
      lastTouch: {},
      ballOverIterations: []
    },
    kickOffTeam: attackingTeam,
    secondTeam: team('B', 'B', []),
    iterationLog: []
  }

  ballPassed(matchDetails, attackingTeam, passer)

  const pass = matchDetails.events.find(event => event.type === 'long_ball')
  assert.ok(pass)
  assert.equal(pass.passType, 'long_ball')
  assert.equal(pass.fromPlayerId, 'A1')
  assert.equal(pass.toPlayerId, 'A2')
})

test('throughBall emits structured through-ball event with target and positions', () => {
  const passer = player({
    playerID: 'A1',
    name: 'Passer',
    originPOS: [20, 80],
    currentPOS: [20, 80],
    skill: { strength: 100, jumping: 70, passing: 100, crossing: 80 },
    height: 180
  })
  const runner = player({ playerID: 'A2', name: 'Runner', position: 'ST', originPOS: [40, 60], currentPOS: [40, 60], isMarked: false })
  const attackingTeam = team('A', 'A', [passer, runner])
  const matchDetails = {
    pitchSize: [100, 100],
    matchClock: { tick: 6, minute: 0, second: 6 },
    ball: {
      position: [20, 80, 0],
      lastTouch: {},
      ballOverIterations: []
    },
    kickOffTeam: attackingTeam,
    secondTeam: team('B', 'B', []),
    iterationLog: []
  }

  withRandomSequence([0.5, 0.5, 0.5, 0.5], () => {
    require('../vendor/footballSimulationEngine/lib/ballMovement').throughBall(matchDetails, attackingTeam, passer)
  })

  const pass = matchDetails.events.find(event => event.type === 'through_ball')
  assert.equal(pass.fromPlayerId, 'A1')
  assert.equal(pass.toPlayerId, 'A2')
  assert.equal(pass.passType, 'through_ball')
  assert.deepEqual(pass.start, { x: 20, y: 80 })
  assert.deepEqual(pass.target, { x: 40, y: 60 })
})

test('cleared ball emits structured clearance event', () => {
  const defender = player({
    playerID: 'B4',
    name: 'Defender',
    action: 'cleared',
    hasBall: true,
    originPOS: [50, 20],
    currentPOS: [50, 20]
  })
  const defendingTeam = team('B', 'B', [defender])
  const matchDetails = {
    pitchSize: [100, 100],
    matchClock: { tick: 7, minute: 0, second: 7 },
    ball: { position: [50, 20, 0], Player: 'B4', withPlayer: true, withTeam: 'B', lastTouch: {}, ballOverIterations: [] },
    kickOffTeam: team('A', 'A', []),
    secondTeam: defendingTeam,
    iterationLog: []
  }

  handleBallPlayerActions(matchDetails, defender, defendingTeam, matchDetails.kickOffTeam, 'cleared')

  const clearance = matchDetails.events.find(event => event.type === 'clearance')
  assert.equal(clearance.playerId, 'B4')
  assert.equal(clearance.playerName, 'Defender')
  assert.equal(clearance.teamId, 'B')
  assert.deepEqual(clearance.start, { x: 50, y: 20 })
  assert.equal(Number.isFinite(clearance.end.x), true)
  assert.equal(Number.isFinite(clearance.end.y), true)
})

test('completed pass updates the original structured pass outcome', () => {
  const receiver = player({ playerID: 'A2', name: 'Receiver', currentPOS: [40, 80], originPOS: [40, 80] })
  const attackingTeam = team('A', 'A', [player({ playerID: 'A1', name: 'Passer' }), receiver])
  const matchDetails = {
    pitchSize: [100, 100],
    matchClock: { tick: 8, minute: 0, second: 8 },
    events: [{ id: '5:pass:1', type: 'pass', teamId: 'A', fromPlayerId: 'A1', toPlayerId: 'A2', outcome: 'attempted' }],
    ball: { position: [40, 80, 0], lastTouch: { playerID: 'A1', teamID: 'A', action: 'pass', passEventId: '5:pass:1' }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: team('B', 'B', []),
    iterationLog: []
  }

  setBallMovementMatchDetails(matchDetails, receiver, [40, 80, 0], attackingTeam)

  assert.equal(matchDetails.events[0].outcome, 'completed')
  assert.equal(matchDetails.events[0].receiverPlayerId, 'A2')
  assert.equal(matchDetails.events[0].receiverPlayerName, 'Receiver')
})

test('intercepted pass updates the original structured pass outcome', () => {
  const interceptor = player({ playerID: 'B6', name: 'Interceptor', currentPOS: [42, 44], originPOS: [42, 44] })
  const defendingTeam = team('B', 'B', [interceptor])
  const matchDetails = {
    pitchSize: [100, 100],
    matchClock: { tick: 8, minute: 0, second: 8 },
    events: [{ id: '5:pass:1', type: 'pass', teamId: 'A', fromPlayerId: 'A1', toPlayerId: 'A2', outcome: 'attempted' }],
    ball: { position: [42, 44, 0], lastTouch: { playerID: 'A8', teamID: 'A', action: 'pass', passEventId: '5:pass:1' }, ballOverIterations: [] },
    kickOffTeam: team('A', 'A', []),
    secondTeam: defendingTeam,
    iterationLog: []
  }

  setDeflectionPlayerHasBall(0, matchDetails, interceptor, defendingTeam)

  assert.equal(matchDetails.events[0].outcome, 'intercepted')
  assert.equal(matchDetails.events[0].interceptorPlayerId, 'B6')
  assert.equal(matchDetails.events[0].interceptorPlayerName, 'Interceptor')
})

test('controlled deflection emits structured interception event', () => {
  const interceptor = player({ playerID: 'B6', name: 'Interceptor', currentPOS: [42, 44], originPOS: [42, 44] })
  const defendingTeam = team('B', 'B', [interceptor])
  const matchDetails = {
    pitchSize: [100, 100],
    matchClock: { tick: 8, minute: 0, second: 8 },
    ball: { position: [42, 44, 0], lastTouch: { playerID: 'A8', teamID: 'A' }, ballOverIterations: [] },
    kickOffTeam: team('A', 'A', []),
    secondTeam: defendingTeam,
    iterationLog: []
  }

  setDeflectionPlayerHasBall(0, matchDetails, interceptor, defendingTeam)

  const interception = matchDetails.events.find(event => event.type === 'interception')
  assert.equal(interception.playerId, 'B6')
  assert.equal(interception.playerName, 'Interceptor')
  assert.equal(interception.teamId, 'B')
  assert.deepEqual(interception.position, { x: 42, y: 44 })
  assert.equal(interception.outcome, 'controlled')
})

test('moving ball interception keeps structured team identity from proximity resolution', () => {
  const interceptor = player({ playerID: 'B6', name: 'Interceptor', currentPOS: [42, 44], originPOS: [42, 44], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 80, control: 100, perception: 80 } })
  const defendingTeam = team('Defence', 'B', [interceptor])
  const matchDetails = {
    pitchSize: [100, 100],
    matchClock: { tick: 9, minute: 0, second: 9 },
    ball: { position: [42, 44, 0], lastTouch: { playerID: 'A8', teamID: 'A', iterations: 5 }, ballOverIterations: [] },
    kickOffTeam: team('Attack', 'A', []),
    secondTeam: defendingTeam,
    iterationLog: []
  }

  withRandomSequence([0.99, 0.01], () => {
    thisPlayerIsInProximity(matchDetails, interceptor, [42, 44, 0], [42, 44, 0], 50, defendingTeam)
  })

  const interception = matchDetails.events.find(event => event.type === 'interception')
  assert.equal(interception.teamId, 'B')
  assert.equal(interception.teamName, 'Defence')
})

test('controlled interception clears previous ball holders', () => {
  const oldHolder = player({ playerID: 'A8', name: 'Old Holder', hasBall: true })
  const interceptor = player({ playerID: 'B6', name: 'Interceptor', currentPOS: [42, 44], originPOS: [42, 44] })
  const defendingTeam = team('Defence', 'B', [interceptor])
  const matchDetails = {
    pitchSize: [100, 100],
    matchClock: { tick: 9, minute: 0, second: 9 },
    ball: { position: [42, 44, 0], lastTouch: { playerID: 'A8', teamID: 'A' }, ballOverIterations: [] },
    kickOffTeam: team('Attack', 'A', [oldHolder]),
    secondTeam: defendingTeam,
    iterationLog: []
  }

  setDeflectionPlayerHasBall(0, matchDetails, interceptor, defendingTeam)

  assert.equal(oldHolder.hasBall, false)
  assert.equal(interceptor.hasBall, true)
})

test('keeper collection clears previous ball holders', () => {
  const oldHolder = player({ playerID: 'A8', name: 'Old Holder', hasBall: true })
  const keeper = player({ playerID: 'B1', name: 'Keeper', position: 'GK', currentPOS: [50, 0], originPOS: [50, 0] })
  const defendingTeam = team('Defence', 'B', [keeper])
  const matchDetails = {
    pitchSize: [100, 100],
    ball: { position: [50, 0, 0], lastTouch: {}, ballOverIterations: [] },
    kickOffTeam: team('Attack', 'A', [oldHolder]),
    secondTeam: defendingTeam,
    iterationLog: []
  }

  setBallMovementMatchDetails(matchDetails, keeper, [50, 0, 0], defendingTeam)
  keeper.hasBall = true

  assert.equal(oldHolder.hasBall, false)
  assert.equal(keeper.hasBall, true)
})

test('loose ball collection clears previous ball holders', () => {
  const oldHolder = player({ playerID: 'A8', name: 'Old Holder', hasBall: true })
  const collector = player({ playerID: 'B6', name: 'Collector', currentPOS: [42, 44], originPOS: [42, 44] })
  const defendingTeam = team('Defence', 'B', [collector])
  const attackingTeam = team('Attack', 'A', [oldHolder])
  const matchDetails = {
    pitchSize: [100, 100],
    ball: { position: [42, 44, 0], lastTouch: {}, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    iterationLog: []
  }

  setClosePlayerTakesBall(matchDetails, collector, defendingTeam, attackingTeam)

  assert.equal(oldHolder.hasBall, false)
  assert.equal(collector.hasBall, true)
})

test('successful tackle clears previous ball holders', () => {
  const oldHolder = player({ playerID: 'A8', name: 'Old Holder', hasBall: true })
  const tackler = player({ playerID: 'B6', name: 'Tackler', currentPOS: [42, 44], originPOS: [42, 44] })
  const defendingTeam = team('Defence', 'B', [tackler])
  const attackingTeam = team('Attack', 'A', [oldHolder])
  const matchDetails = {
    pitchSize: [100, 100],
    ball: { position: [42, 44, 0], lastTouch: {}, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    iterationLog: []
  }

  setPostTackleBall(matchDetails, defendingTeam, attackingTeam, tackler)

  assert.equal(oldHolder.hasBall, false)
  assert.equal(tackler.hasBall, true)
})

test('uncontrolled shot deflection emits structured blocked shot event', () => {
  const blocker = player({ playerID: 'B5', name: 'Blocker', currentPOS: [48, 30], originPOS: [48, 30], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 80, control: 0, perception: 80 } })
  const defendingTeam = team('B', 'B', [player({ playerID: 'B1', name: 'Keeper', position: 'GK', originPOS: [50, 0], currentPOS: [50, 0] }), blocker])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    matchClock: { tick: 9, minute: 0, second: 9 },
    events: [{ id: 'shot-9', tick: 9, type: 'shot', playerId: 'A9', playerName: 'A Nine', teamId: 'A', teamName: 'A', xg: 0.19, outcome: 'pending' }],
    ball: { position: [48, 30, 0], direction: 'wait', lastTouch: { playerID: 'A9', teamID: 'A', action: 'shot', shotEventId: 'shot-9' }, ballOverIterations: [] },
    kickOffTeam: team('A', 'A', [player({ playerID: 'A1', name: 'A Keeper', position: 'GK', originPOS: [50, 100], currentPOS: [50, 100] })]),
    secondTeam: defendingTeam,
    iterationLog: []
  }

  withRandomSequence([0.99, 0.99, 0.5], () => {
    resolveDeflection(80, [48, 30, 0], [48, 30], blocker, defendingTeam, 10, matchDetails)
  })

  const block = matchDetails.events.find(event => event.type === 'blocked_shot')
  assert.equal(block.playerId, 'B5')
  assert.equal(block.playerName, 'Blocker')
  assert.equal(block.teamId, 'B')
  assert.equal(block.shotId, 'shot-9')
  assert.deepEqual(block.position, { x: 48, y: 30 })
  assert.equal(block.xg, 0.19)
  assert.equal(block.outcome, 'blocked')
  assert.equal(matchDetails.events[0].outcome, 'blocked')
  assert.equal(matchDetails.ball.lastTouch.shotEventId, undefined)
})

test('corner setup emits structured set-piece event', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM', originPOS: [50, 80], currentPOS: [50, 80] })))
  const defendingTeam = team('Defence', 'B', Array.from({ length: 11 }, (_, index) => player({ playerID: `B${index + 1}`, position: index === 0 ? 'GK' : 'CM', originPOS: [50, 20], currentPOS: [50, 20] })))
  const matchDetails = {
    pitchSize: [100, 100, 20],
    matchClock: { tick: 10, minute: 0, second: 10 },
    ball: { position: [0, 0, 0], lastTouch: {}, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  setPositions.setTopLeftCornerPositions(matchDetails)

  const setPiece = matchDetails.events.find(event => event.type === 'set_piece' && event.kind === 'corner')
  assert.equal(setPiece.teamId, 'A')
  assert.equal(setPiece.teamName, 'Attack')
  assert.deepEqual(setPiece.position, { x: 0, y: 0 })
  assert.equal(setPiece.reason, 'ball_out')
})

test('goal kick setup emits structured set-piece event', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM', originPOS: [50, 20], currentPOS: [50, 20] })))
  const defendingTeam = team('Defence', 'B', Array.from({ length: 11 }, (_, index) => player({ playerID: `B${index + 1}`, position: index === 0 ? 'GK' : 'CM', originPOS: [50, 80], currentPOS: [50, 80] })))
  const matchDetails = {
    pitchSize: [100, 100, 20],
    matchClock: { tick: 11, minute: 0, second: 11 },
    ball: { position: [50, 20, 0], lastTouch: {}, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  setPositions.setTopGoalKick(matchDetails)

  const setPiece = matchDetails.events.find(event => event.type === 'set_piece' && event.kind === 'goal_kick')
  assert.equal(setPiece.teamId, 'A')
  assert.equal(setPiece.teamName, 'Attack')
  assert.deepEqual(setPiece.position, { x: 50, y: 20 })
  assert.equal(setPiece.reason, 'ball_out')
})

test('throw-in setup emits structured set-piece event', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM', originPOS: [50, 20 + index], currentPOS: [50, 20 + index] })))
  const defendingTeam = team('Defence', 'B', Array.from({ length: 11 }, (_, index) => player({ playerID: `B${index + 1}`, position: index === 0 ? 'GK' : 'CM', originPOS: [50, 80 - index], currentPOS: [50, 80 - index] })))
  const matchDetails = {
    pitchSize: [100, 100, 20],
    matchClock: { tick: 12, minute: 0, second: 12 },
    ball: { position: [0, 45, 0], lastTouch: {}, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    iterationLog: []
  }

  setPositions.setLeftKickOffTeamThrowIn(matchDetails, [-1, 45, 0])

  const setPiece = matchDetails.events.find(event => event.type === 'set_piece' && event.kind === 'throw_in')
  assert.equal(setPiece.teamId, 'A')
  assert.equal(setPiece.teamName, 'Attack')
  assert.deepEqual(setPiece.position, { x: 0, y: 45 })
  assert.equal(setPiece.reason, 'ball_out')
})

test('free kick setup emits structured set-piece event', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM', originPOS: [50, 80], currentPOS: [50, 80] })))
  const defendingTeam = team('Defence', 'B', Array.from({ length: 11 }, (_, index) => player({ playerID: `B${index + 1}`, position: index === 0 ? 'GK' : 'CM', originPOS: [50, 20], currentPOS: [50, 20] })))
  const matchDetails = {
    pitchSize: [100, 100, 20],
    matchClock: { tick: 13, minute: 0, second: 13 },
    ball: { position: [35, 50, 0], lastTouch: {}, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  setPositions.setSetpieceKickOffTeam(matchDetails)

  const setPiece = matchDetails.events.find(event => event.type === 'set_piece' && event.kind === 'free_kick')
  assert.equal(setPiece.teamId, 'A')
  assert.equal(setPiece.teamName, 'Attack')
  assert.deepEqual(setPiece.position, { x: 35, y: 50 })
  assert.equal(setPiece.reason, 'infringement')
})

test('penalty setup emits structured set-piece event', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM', originPOS: [50, 80], currentPOS: [50, 80], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80 + index, saving: 80, control: 80, perception: 80 } })))
  const defendingTeam = team('Defence', 'B', Array.from({ length: 11 }, (_, index) => player({ playerID: `B${index + 1}`, position: index === 0 ? 'GK' : 'CM', originPOS: [50, 20], currentPOS: [50, 20] })))
  const matchDetails = {
    pitchSize: [100, 100, 20],
    matchClock: { tick: 14, minute: 0, second: 14 },
    ball: { position: [50, 10, 0], lastTouch: {}, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  setPositions.setSetpieceKickOffTeam(matchDetails)

  const setPiece = matchDetails.events.find(event => event.type === 'set_piece' && event.kind === 'penalty')
  assert.equal(setPiece.teamId, 'A')
  assert.equal(setPiece.teamName, 'Attack')
  assert.deepEqual(setPiece.position, { x: 50, y: 10 })
  assert.equal(setPiece.reason, 'penalty_area_infringement')
})

test('ball carrier short run does not emit public dribble event', () => {
  const runner = player({ playerID: 'A8', name: 'Runner', action: 'run', hasBall: true, originPOS: [50, 30], currentPOS: [50, 30], fitness: 100 })
  const attackingTeam = team('A', 'A', [runner])
  const matchDetails = {
    pitchSize: [100, 100],
    matchClock: { tick: 10, minute: 0, second: 10 },
    ball: { position: [50, 30, 0], Player: 'A8', withPlayer: true, withTeam: 'A', lastTouch: {}, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: team('B', 'B', []),
    iterationLog: []
  }

  withRandomSequence([0.5, 0.5], () => {
    movePlayers([{ player: runner, action: 'run', move: [1, 1] }], attackingTeam, matchDetails.secondTeam, matchDetails)
  })

  assert.equal((matchDetails.events ?? []).some(event => event.type === 'dribble'), false)
})

test('ball carrier meaningful run emits structured dribble event', () => {
  const runner = player({ playerID: 'A8', name: 'Runner', action: 'run', hasBall: true, originPOS: [50, 30], currentPOS: [50, 30], fitness: 100 })
  const attackingTeam = team('A', 'A', [runner])
  const matchDetails = {
    pitchSize: [100, 100],
    matchClock: { tick: 10, minute: 0, second: 10 },
    ball: { position: [50, 30, 0], Player: 'A8', withPlayer: true, withTeam: 'A', lastTouch: {}, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: team('B', 'B', []),
    iterationLog: []
  }

  withRandomSequence([0.5, 0.5], () => {
    movePlayers([{ player: runner, action: 'run', move: [18, 0] }], attackingTeam, matchDetails.secondTeam, matchDetails)
  })

  const dribble = matchDetails.events.find(event => event.type === 'dribble')
  assert.equal(dribble.playerId, 'A8')
  assert.equal(dribble.playerName, 'Runner')
  assert.deepEqual(dribble.start, { x: 50, y: 30 })
  assert.deepEqual(dribble.end, { x: 68, y: 30 })
})

test('successive short carries aggregate into one public dribble event only after meaningful distance', () => {
  const runner = player({ playerID: 'A8', name: 'Runner', action: 'run', hasBall: true, originPOS: [50, 30], currentPOS: [50, 30], fitness: 100 })
  const attackingTeam = team('A', 'A', [runner])
  const matchDetails = {
    pitchSize: [100, 100],
    matchClock: { tick: 10, minute: 0, second: 10 },
    ball: { position: [50, 30, 0], Player: 'A8', withPlayer: true, withTeam: 'A', lastTouch: {}, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: team('B', 'B', []),
    iterationLog: []
  }

  movePlayers([{ player: runner, action: 'run', move: [3, 0] }], attackingTeam, matchDetails.secondTeam, matchDetails)
  movePlayers([{ player: runner, action: 'run', move: [3, 0] }], attackingTeam, matchDetails.secondTeam, matchDetails)
  movePlayers([{ player: runner, action: 'run', move: [3, 0] }], attackingTeam, matchDetails.secondTeam, matchDetails)
  assert.equal((matchDetails.events ?? []).filter(event => event.type === 'dribble').length, 0)

  movePlayers([{ player: runner, action: 'run', move: [3, 0] }], attackingTeam, matchDetails.secondTeam, matchDetails)
  movePlayers([{ player: runner, action: 'run', move: [3, 0] }], attackingTeam, matchDetails.secondTeam, matchDetails)
  movePlayers([{ player: runner, action: 'run', move: [3, 0] }], attackingTeam, matchDetails.secondTeam, matchDetails)

  const dribbles = (matchDetails.events ?? []).filter(event => event.type === 'dribble')
  assert.equal(dribbles.length, 1)
  assert.deepEqual(dribbles[0].start, { x: 50, y: 30 })
  assert.deepEqual(dribbles[0].end, { x: 68, y: 30 })
})

test('ballPassed prefers tactical action target when available', () => {
  const passer = player({
    actionTargetPlayerId: 'A3',
    skill: { strength: 100, jumping: 70, passing: 100, crossing: 80 },
    height: 180
  })
  const defaultTarget = player({ playerID: 'A2', name: 'Default Target', position: [20, 95], currentPOS: [20, 95], originPOS: [20, 95], isMarked: false })
  const tacticalTarget = player({ playerID: 'A3', name: 'Tactical Target', position: [80, 82], currentPOS: [80, 82], originPOS: [80, 82], isMarked: false })
  const attackingTeam = team('A', 'A', [passer, defaultTarget, tacticalTarget])
  const matchDetails = {
    pitchSize: [100, 100],
    ball: {
      position: [20, 80, 0],
      lastTouch: {},
      ballOverIterations: []
    },
    kickOffTeam: attackingTeam,
    secondTeam: team('B', 'B', []),
    iterationLog: []
  }

  ballPassed(matchDetails, attackingTeam, passer)

  assert.ok(matchDetails.iterationLog.includes('Target selected: Tactical Target'))
})

test('ball trajectories resolve within realistic tick windows', () => {
  const passPath = common.getBallTrajectory([20, 50, 0], [45, 50, 0], 20, 'pass', 100)
  const shotPath = common.getBallTrajectory([50, 80, 0], [50, 100, 0], 35, 'shot', 100)

  assert.ok(passPath.length <= 12)
  assert.ok(shotPath.length <= 8)
})

test('checkGoalScored does not score non-shot balls crossing the goal line', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM' })))
  const defendingTeam = team('Defence', 'B', Array.from({ length: 11 }, (_, index) => player({ playerID: `B${index + 1}`, position: index === 0 ? 'GK' : 'CM' })))
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    ball: { position: [50, 101, 0], lastTouch: { playerName: 'A Nine', teamID: attackingTeam.teamID, action: 'pass' }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  checkGoalScored(matchDetails)

  assert.equal(matchDetails.kickOffTeamStatistics.goals, 0)
  assert.equal(matchDetails.secondTeamStatistics.goals, 0)
})

test('checkGoalScored does not score off-target shots crossing the goal line', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM' })))
  const defendingTeam = team('Defence', 'B', Array.from({ length: 11 }, (_, index) => player({ playerID: `B${index + 1}`, position: index === 0 ? 'GK' : 'CM', currentPOS: [0, 0] })))
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    ball: { position: [50, 101, 0], lastTouch: { playerName: 'A Nine', teamID: attackingTeam.teamID, action: 'shot', shotOnTarget: false }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  checkGoalScored(matchDetails)

  assert.equal(matchDetails.kickOffTeamStatistics.goals, 0)
  assert.equal(matchDetails.secondTeamStatistics.goals, 0)
})

test('keepInBoundaries does not score off-target shots through the posts', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM', originPOS: [50, 100], currentPOS: [50, 100] })))
  const defendingTeam = team('Defence', 'B', [
    player({ playerID: 'B1', position: 'GK', originPOS: [50, 0], currentPOS: [50, 0], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 0, control: 80, perception: 80 } }),
    ...Array.from({ length: 10 }, (_, index) => player({ playerID: `B${index + 2}`, position: 'CM', originPOS: [50, 0], currentPOS: [50, 0] }))
  ])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    ball: { position: [50, 1, 0], lastTouch: { playerName: 'A Nine', teamID: attackingTeam.teamID, action: 'shot', shotOnTarget: false }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  setPositions.keepInBoundaries(matchDetails, attackingTeam.teamID, [50, -1, 0])

  assert.equal(matchDetails.kickOffTeamStatistics.goals, 0)
  assert.equal(matchDetails.secondTeamStatistics.goals, 0)
})

test('checkGoalScored lets goalkeepers contest shots across the goalmouth', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM' })))
  const keeper = player({ playerID: 'B1', name: 'Keeper', position: 'GK', originPOS: [50, 100], currentPOS: [50, 94], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 100, control: 80, perception: 80 } })
  const defendingTeam = team('Defence', 'B', [keeper, ...Array.from({ length: 10 }, (_, index) => player({ playerID: `B${index + 2}`, position: 'CM' }))])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    ball: { position: [58, 101, 0], lastTouch: { playerName: 'A Nine', teamID: attackingTeam.teamID }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0], () => {
    checkGoalScored(matchDetails)
  })

  assert.equal(matchDetails.kickOffTeamStatistics.goals, 0)
  assert.equal(matchDetails.ball.withPlayer, true)
  assert.equal(matchDetails.ball.Player, 'B1')
})

test('checkGoalScored emits structured save events', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM' })))
  const keeper = player({ playerID: 'B1', name: 'Keeper', position: 'GK', originPOS: [50, 100], currentPOS: [50, 94], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 100, control: 80, perception: 80 } })
  const defendingTeam = team('Defence', 'B', [keeper, ...Array.from({ length: 10 }, (_, index) => player({ playerID: `B${index + 2}`, position: 'CM' }))])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    matchClock: { tick: 20, minute: 0, second: 20 },
    tactical: { shotQuality: { xg: 0.22 } },
    events: [{ id: 'shot-20', tick: 20, type: 'shot', playerName: 'A Nine', teamId: attackingTeam.teamID, xg: 0.22, outcome: 'pending' }],
    ball: { position: [58, 101, 0], lastTouch: { playerName: 'A Nine', playerID: 'A9', teamID: attackingTeam.teamID, action: 'shot', shotOnTarget: true, shotEventId: 'shot-20' }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0], () => {
    checkGoalScored(matchDetails)
  })

  const save = matchDetails.events.find(event => event.type === 'save')
  assert.equal(save.shotId, 'shot-20')
  assert.equal(save.playerId, 'B1')
  assert.equal(save.playerName, 'Keeper')
  assert.equal(save.teamId, 'B')
  assert.equal(save.xg, 0.22)
  assert.equal(save.outcome, 'saved')
  assert.equal(matchDetails.events[0].outcome, 'saved')
  assert.equal(matchDetails.ball.lastTouch.shotEventId, undefined)
})

test('checkGoalScored does not link saves to stale global shot history', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM' })))
  const keeper = player({ playerID: 'B1', name: 'Keeper', position: 'GK', originPOS: [50, 100], currentPOS: [50, 94], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 100, control: 80, perception: 80 } })
  const defendingTeam = team('Defence', 'B', [keeper, ...Array.from({ length: 10 }, (_, index) => player({ playerID: `B${index + 2}`, position: 'CM' }))])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    matchClock: { tick: 80, minute: 1, second: 20 },
    tactical: { shotQuality: { xg: 0.22 } },
    events: [{ id: 'shot-20', tick: 20, type: 'shot', playerName: 'A Nine', teamId: attackingTeam.teamID, xg: 0.22, outcome: 'pending' }],
    ball: { position: [58, 101, 0], lastTouch: { playerName: 'A Nine', playerID: 'A9', teamID: attackingTeam.teamID, action: 'pass', shotOnTarget: true }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0], () => {
    checkGoalScored(matchDetails)
  })

  assert.equal(matchDetails.events.some(event => event.type === 'save' && event.shotId === 'shot-20'), false)
  assert.equal(matchDetails.events[0].outcome, 'pending')
})

test('checkGoalScored does not emit a second linked save for an already resolved shot', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM' })))
  const keeper = player({ playerID: 'B1', name: 'Keeper', position: 'GK', originPOS: [50, 100], currentPOS: [50, 94], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 100, control: 80, perception: 80 } })
  const defendingTeam = team('Defence', 'B', [keeper, ...Array.from({ length: 10 }, (_, index) => player({ playerID: `B${index + 2}`, position: 'CM' }))])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    matchClock: { tick: 20, minute: 0, second: 20 },
    events: [{ id: 'shot-20', tick: 20, type: 'shot', playerName: 'A Nine', teamId: attackingTeam.teamID, xg: 0.22, outcome: 'pending' }],
    ball: { position: [58, 101, 0], lastTouch: { playerName: 'A Nine', playerID: 'A9', teamID: attackingTeam.teamID, action: 'shot', shotOnTarget: true, shotEventId: 'shot-20' }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0], () => {
    checkGoalScored(matchDetails)
  })
  matchDetails.ball.position = [58, 101, 0]
  matchDetails.ball.lastTouch.action = 'shot'
  matchDetails.ball.lastTouch.shotOnTarget = true

  withRandomSequence([0], () => {
    checkGoalScored(matchDetails)
  })

  const linkedSaves = matchDetails.events.filter(event => event.type === 'save' && event.shotId === 'shot-20')
  assert.equal(linkedSaves.length, 1)
})

test('checkGoalScored does not emit same-team saves', () => {
  const keeper = player({ playerID: 'A1', name: 'Keeper', position: 'GK', originPOS: [50, 100], currentPOS: [50, 94], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 100, control: 80, perception: 80 } })
  const attackingTeam = team('Attack', 'A', [keeper, ...Array.from({ length: 10 }, (_, index) => player({ playerID: `A${index + 2}`, position: 'CM' }))])
  const defendingTeam = team('Defence', 'B', Array.from({ length: 11 }, (_, index) => player({ playerID: `B${index + 1}`, position: index === 0 ? 'GK' : 'CM' })))
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    matchClock: { tick: 20, minute: 0, second: 20 },
    events: [{ id: 'shot-20', tick: 20, type: 'shot', playerId: 'A9', playerName: 'A Nine', teamId: 'A', teamName: 'Attack', xg: 0.22, outcome: 'pending' }],
    ball: { position: [58, 101, 0], lastTouch: { playerName: 'A Nine', playerID: 'A9', teamID: 'A', action: 'shot', shotOnTarget: true, shotEventId: 'shot-20' }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0], () => {
    checkGoalScored(matchDetails)
  })

  assert.equal(matchDetails.events.some(event => event.type === 'save'), false)
  assert.equal(matchDetails.events[0].outcome, 'pending')
})

test('checkGoalScored does not let a player save their own shot', () => {
  const keeper = player({ playerID: 'A1', name: 'Keeper', position: 'GK', originPOS: [50, 100], currentPOS: [50, 94], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 100, control: 80, perception: 80 } })
  const attackingTeam = team('Attack', 'A', [keeper, ...Array.from({ length: 10 }, (_, index) => player({ playerID: `A${index + 2}`, position: 'CM' }))])
  const defendingTeam = team('Defence', 'B', Array.from({ length: 11 }, (_, index) => player({ playerID: `B${index + 1}`, position: index === 0 ? 'GK' : 'CM' })))
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    matchClock: { tick: 20, minute: 0, second: 20 },
    events: [{ id: 'shot-20', tick: 20, type: 'shot', playerId: 'A1', playerName: 'Keeper', teamId: 'B', teamName: 'Defence', xg: 0.22, outcome: 'pending' }],
    ball: { position: [58, 101, 0], lastTouch: { playerName: 'Keeper', playerID: 'A1', teamID: 'B', action: 'shot', shotOnTarget: true, shotEventId: 'shot-20' }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0], () => {
    checkGoalScored(matchDetails)
  })

  assert.equal(matchDetails.events.some(event => event.type === 'save'), false)
  assert.equal(matchDetails.events[0].outcome, 'pending')
})

test('goal events copy xG and context from the linked pending shot', () => {
  const scorer = player({ playerID: 'A9', name: 'A Nine', originPOS: [50, 20], currentPOS: [50, 20] })
  const attackingTeam = team('Attack', 'A', [player({ playerID: 'A1', position: 'GK', originPOS: [50, 0], currentPOS: [50, 0] }), ...Array.from({ length: 7 }, (_, index) => player({ playerID: `A${index + 2}` })), scorer, player({ playerID: 'A10' }), player({ playerID: 'A11' })])
  const defendingTeam = team('Defence', 'B', Array.from({ length: 11 }, (_, index) => player({ playerID: `B${index + 1}`, position: index === 0 ? 'GK' : 'CM', originPOS: [50, 100], currentPOS: [50, 100] })))
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    matchClock: { tick: 20, minute: 0, second: 20 },
    events: [{ id: 'shot-20', tick: 20, type: 'shot', playerId: 'A9', playerName: 'A Nine', teamId: 'A', teamName: 'Attack', xg: 0.42, phase: 'attack', pressure: { score: 0.2 }, outcome: 'pending' }],
    ball: { position: [50, 101, 0], lastTouch: { playerName: 'A Nine', playerID: 'A9', teamID: 'A', action: 'shot', shotOnTarget: true, shotEventId: 'shot-20' }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  setPositions.setKickOffTeamGoalScored(matchDetails)

  const goal = matchDetails.events.find(event => event.type === 'goal')
  assert.equal(goal.shotId, 'shot-20')
  assert.equal(goal.playerId, 'A9')
  assert.equal(goal.playerName, 'A Nine')
  assert.equal(goal.teamId, 'A')
  assert.equal(goal.xg, 0.42)
  assert.equal(goal.phase, 'attack')
  assert.deepEqual(goal.pressure, { score: 0.2 })
  assert.equal(matchDetails.events[0].outcome, 'goal')
})

test('moveBall resolves on-target shots that cross the goal line after the shot tick', () => {
  const attackingTeam = team('Attack', 'A', [
    player({ playerID: 'A1', position: 'GK', originPOS: [50, 100], currentPOS: [50, 100] }),
    ...Array.from({ length: 10 }, (_, index) => player({ playerID: `A${index + 2}`, position: 'CM', originPOS: [0, 100], currentPOS: [0, 100] }))
  ])
  const defendingTeam = team('Defence', 'B', [
    player({ playerID: 'B1', name: 'Keeper', position: 'GK', originPOS: [0, 0], currentPOS: [0, 0], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 0, control: 80, perception: 80 } }),
    ...Array.from({ length: 10 }, (_, index) => player({ playerID: `B${index + 2}`, position: 'CM', originPOS: [0, 0], currentPOS: [0, 0] }))
  ])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    matchClock: { tick: 21, minute: 0, second: 21 },
    events: [{ id: 'shot-20', tick: 20, type: 'shot', playerName: 'A Nine', teamId: attackingTeam.teamID, outcome: 'on_target' }],
    ball: {
      position: [50, 1, 0],
      direction: 'north',
      power: 20,
      lastTouch: { playerName: 'A Nine', playerID: 'A9', teamID: attackingTeam.teamID, action: 'shot', shotOnTarget: true, iterations: 4 },
      ballOverIterations: [[50, -1, 0]]
    },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  moveBall(matchDetails)

  assert.equal(matchDetails.secondTeamStatistics.goals, 1)
})

test('checkGoalScored lets goalkeepers contest goalmouth shots from their goal anchor', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM' })))
  const keeper = player({ playerID: 'B1', name: 'Keeper', position: 'GK', originPOS: [50, 100], currentPOS: [50, 40], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 100, control: 80, perception: 80 } })
  const defendingTeam = team('Defence', 'B', [keeper, ...Array.from({ length: 10 }, (_, index) => player({ playerID: `B${index + 2}`, position: 'CM' }))])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    ball: { position: [50, 101, 0], lastTouch: { playerName: 'A Nine', teamID: attackingTeam.teamID, action: 'shot', shotOnTarget: true }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0], () => {
    checkGoalScored(matchDetails)
  })

  assert.equal(matchDetails.kickOffTeamStatistics.goals, 0)
  assert.equal(matchDetails.ball.Player, 'B1')
})

test('checkGoalScored lets high-xG shots beat marginal keeper saves', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM' })))
  const keeper = player({ playerID: 'B1', name: 'Keeper', position: 'GK', originPOS: [50, 100], currentPOS: [50, 94], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 80, control: 80, perception: 80 } })
  const defendingTeam = team('Defence', 'B', [keeper, ...Array.from({ length: 10 }, (_, index) => player({ playerID: `B${index + 2}`, position: 'CM' }))])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    tactical: { shotQuality: { xg: 0.7 } },
    ball: { position: [50, 101, 0], lastTouch: { playerName: 'A Nine', teamID: attackingTeam.teamID, action: 'shot', shotOnTarget: true }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0.75], () => {
    checkGoalScored(matchDetails)
  })

  assert.equal(matchDetails.kickOffTeamStatistics.goals, 1)
  assert.equal(keeper.stats.saves, 0)
})

test('checkGoalScored lets average keepers concede some medium-xG shots', () => {
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM' })))
  const keeper = player({ playerID: 'B1', name: 'Keeper', position: 'GK', originPOS: [50, 100], currentPOS: [50, 94], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 80, control: 80, perception: 80 } })
  const defendingTeam = team('Defence', 'B', [keeper, ...Array.from({ length: 10 }, (_, index) => player({ playerID: `B${index + 2}`, position: 'CM' }))])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    tactical: { shotQuality: { xg: 0.4 } },
    ball: { position: [50, 101, 0], lastTouch: { playerName: 'A Nine', teamID: attackingTeam.teamID, action: 'shot', shotOnTarget: true }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0.65], () => {
    checkGoalScored(matchDetails)
  })

  assert.equal(matchDetails.kickOffTeamStatistics.goals, 1)
  assert.equal(keeper.stats.saves, 0)
})

test('checkGoalScored scales keeper lateral reach by goal width', () => {
  const keeper = player({ playerID: 'B1', name: 'Keeper', position: 'GK', originPOS: [340, 0], currentPOS: [340, 25], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 100, control: 80, perception: 80 } })
  const attackingTeam = team('Attack', 'A', Array.from({ length: 11 }, (_, index) => player({ playerID: `A${index + 1}`, position: index === 0 ? 'GK' : 'CM', originPOS: [340, 1050], currentPOS: [340, 1050] })))
  const defendingTeam = team('Defence', 'B', [keeper, ...Array.from({ length: 10 }, (_, index) => player({ playerID: `B${index + 2}`, position: 'CM' }))])
  const matchDetails = {
    pitchSize: [680, 1050, 90],
    half: 1,
    ball: { position: [410, -1, 0], lastTouch: { playerName: 'A Nine', teamID: attackingTeam.teamID, action: 'shot' }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0], () => {
    checkGoalScored(matchDetails)
  })

  assert.equal(matchDetails.kickOffTeamStatistics.goals, 0)
  assert.equal(matchDetails.ball.Player, 'B1')
})

test('shotMade rewards close central shots with on-target attempts', () => {
  const shooter = player({
    playerID: 'A9',
    name: 'A Nine',
    originPOS: [50, 80],
    currentPOS: [50, 20],
    skill: { strength: 100, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 80, control: 80, perception: 80 }
  })
  const attackingTeam = team('A', 'A', [player({ playerID: 'A1', position: 'GK' }), shooter])
  const defendingTeam = team('B', 'B', [player({ playerID: 'B1', position: 'GK', originPOS: [50, 100], currentPOS: [50, 100] })])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    ball: { position: [50, 20, 0], lastTouch: { iterations: 0 }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0.5, 0, 0.82], () => {
    shotMade(matchDetails, attackingTeam, shooter)
  })

  assert.equal(matchDetails.kickOffTeamStatistics.shots.on, 1)
})

test('shotMade uses high tactical xG to improve shot accuracy', () => {
  const shooter = player({
    playerID: 'A9',
    name: 'A Nine',
    originPOS: [50, 80],
    currentPOS: [50, 20],
    skill: { strength: 100, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 80, control: 80, perception: 80 }
  })
  const attackingTeam = team('A', 'A', [player({ playerID: 'A1', position: 'GK' }), shooter])
  const defendingTeam = team('B', 'B', [player({ playerID: 'B1', position: 'GK', originPOS: [50, 0], currentPOS: [50, 0] })])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    tactical: { shotQuality: { xg: 0.67 } },
    ball: { position: [50, 20, 0], lastTouch: { iterations: 0 }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0.5, 0, 0.95], () => {
    shotMade(matchDetails, attackingTeam, shooter)
  })

  const shot = matchDetails.events.find(event => event.type === 'shot')
  assert.equal(matchDetails.kickOffTeamStatistics.shots.on, 1)
  assert.equal(shot.xg, 0.67)
  assert.equal(shot.outcome, 'pending')
  assert.equal(matchDetails.ball.lastTouch.xg, 0.67)
  assert.equal(matchDetails.ball.lastTouch.shotEventId, shot.id)
})

test('shotMade scales shot accuracy by pitch size', () => {
  const shooter = player({
    playerID: 'A9',
    name: 'A Nine',
    originPOS: [340, 900],
    currentPOS: [340, 190],
    skill: { strength: 100, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 80, control: 80, perception: 80 }
  })
  const attackingTeam = team('A', 'A', [player({ playerID: 'A1', position: 'GK', originPOS: [340, 1050], currentPOS: [340, 1050] }), shooter])
  const defendingTeam = team('B', 'B', [player({ playerID: 'B1', position: 'GK', originPOS: [340, 0], currentPOS: [340, 0] })])
  const matchDetails = {
    pitchSize: [680, 1050, 90],
    tactical: { shotQuality: { xg: 0.67 } },
    ball: { position: [340, 190, 0], lastTouch: { iterations: 0 }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0.5, 0, 0.82], () => {
    shotMade(matchDetails, attackingTeam, shooter)
  })

  assert.equal(matchDetails.kickOffTeamStatistics.shots.on, 1)
})

test('shotMade keeps medium full-pitch chances off target on poor accuracy rolls', () => {
  const shooter = player({
    playerID: 'A9',
    name: 'A Nine',
    originPOS: [340, 900],
    currentPOS: [340, 260],
    skill: { strength: 100, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 80, control: 80, perception: 80 }
  })
  const attackingTeam = team('A', 'A', [player({ playerID: 'A1', position: 'GK', originPOS: [340, 1050], currentPOS: [340, 1050] }), shooter])
  const defendingTeam = team('B', 'B', [player({ playerID: 'B1', position: 'GK', originPOS: [340, 0], currentPOS: [340, 0] })])
  const matchDetails = {
    pitchSize: [680, 1050, 90],
    tactical: { shotQuality: { xg: 0.18 } },
    ball: { position: [340, 260, 0], lastTouch: { iterations: 0 }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0.5, 0, 0.75], () => {
    shotMade(matchDetails, attackingTeam, shooter)
  })

  assert.equal(matchDetails.kickOffTeamStatistics.shots.off, 1)
})

test('shotMade requires stronger accuracy roll for shots on target', () => {
  const shooter = player({
    playerID: 'A9',
    name: 'A Nine',
    originPOS: [50, 80],
    currentPOS: [50, 20],
    skill: { strength: 100, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 80, control: 80, perception: 80 }
  })
  const attackingTeam = team('A', 'A', [player({ playerID: 'A1', position: 'GK' }), shooter])
  const defendingTeam = team('B', 'B', [player({ playerID: 'B1', position: 'GK', originPOS: [50, 0], currentPOS: [50, 0] })])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 1,
    ball: { position: [50, 20, 0], lastTouch: { iterations: 0 }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0.5, 0, 0.95], () => {
    shotMade(matchDetails, attackingTeam, shooter)
  })

  assert.equal(matchDetails.kickOffTeamStatistics.shots.off, 1)
  assert.ok(matchDetails.iterationLog.some(message => /^Shot Off Target/.test(message)))
})

test('shotMade credits shot statistics to the shooting team', () => {
  const shooter = player({ playerID: 'B9', name: 'B Nine', originPOS: [50, 20], currentPOS: [50, 20] })
  const attackingTeam = team('B', 'B', [player({ playerID: 'B1', position: 'GK' }), shooter])
  const defendingTeam = team('A', 'A', [player({ playerID: 'A1', position: 'GK', originPOS: [50, 100], currentPOS: [50, 100] })])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    half: 2,
    ball: { position: [50, 20, 0], lastTouch: { iterations: 0 }, ballOverIterations: [] },
    kickOffTeam: defendingTeam,
    secondTeam: attackingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  shotMade(matchDetails, attackingTeam, shooter)

  assert.equal(matchDetails.kickOffTeamStatistics.shots.total, 0)
  assert.equal(matchDetails.secondTeamStatistics.shots.total, 1)
})

test('low-xG goalmouth boundary shots can be saved', () => {
  const attackingTeam = team('Attack', 'A', [player({ position: 'GK', originPOS: [50, 0], currentPOS: [50, 0] }), player({ playerID: 'A2' }), player({ playerID: 'A3' }), player({ playerID: 'A4' }), player({ playerID: 'A5' }), player({ playerID: 'A6' }), player({ playerID: 'A7' }), player({ playerID: 'A8' }), player({ playerID: 'A9' }), player({ playerID: 'A10' }), player({ playerID: 'A11' })])
  const keeper = player({ playerID: 'B1', name: 'Keeper', position: 'GK', originPOS: [50, 100], currentPOS: [50, 100], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 80, control: 80, perception: 80 } })
  const defendingTeam = team('Defence', 'B', [keeper, player({ playerID: 'B2' }), player({ playerID: 'B3' }), player({ playerID: 'B4' }), player({ playerID: 'B5' }), player({ playerID: 'B6' }), player({ playerID: 'B7' }), player({ playerID: 'B8' }), player({ playerID: 'B9' }), player({ playerID: 'B10' }), player({ playerID: 'B11' })])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    tactical: { shotQuality: { xg: 0.18 } },
    ball: { position: [50, 99, 0], lastTouch: { teamID: attackingTeam.teamID, action: 'shot', shotOnTarget: true }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0.9], () => {
    setPositions.keepInBoundaries(matchDetails, attackingTeam.teamID, [50, 101, 0])
  })

  assert.ok(matchDetails.iterationLog.some(message => /^Corner to - Attack$/.test(message)))
  assert.equal(matchDetails.kickOffTeamStatistics.corners, 1)
  assert.equal(matchDetails.kickOffTeamStatistics.goals, 0)
})

test('high-xG goalmouth boundary shots can beat the keeper', () => {
  const attackingTeam = team('Attack', 'A', [player({ position: 'GK', originPOS: [50, 0], currentPOS: [50, 0] }), player({ playerID: 'A2' }), player({ playerID: 'A3' }), player({ playerID: 'A4' }), player({ playerID: 'A5' }), player({ playerID: 'A6' }), player({ playerID: 'A7' }), player({ playerID: 'A8' }), player({ playerID: 'A9' }), player({ playerID: 'A10' }), player({ playerID: 'A11' })])
  const keeper = player({ playerID: 'B1', name: 'Keeper', position: 'GK', originPOS: [50, 100], currentPOS: [50, 100], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 80, control: 80, perception: 80 } })
  const defendingTeam = team('Defence', 'B', [keeper, player({ playerID: 'B2' }), player({ playerID: 'B3' }), player({ playerID: 'B4' }), player({ playerID: 'B5' }), player({ playerID: 'B6' }), player({ playerID: 'B7' }), player({ playerID: 'B8' }), player({ playerID: 'B9' }), player({ playerID: 'B10' }), player({ playerID: 'B11' })])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    ball: { position: [50, 99, 0], lastTouch: { teamID: attackingTeam.teamID, action: 'shot', shotOnTarget: true, xg: 0.7 }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0.6], () => {
    setPositions.keepInBoundaries(matchDetails, attackingTeam.teamID, [50, 101, 0])
  })

  assert.equal(matchDetails.kickOffTeamStatistics.goals, 1)
  assert.equal(matchDetails.kickOffTeamStatistics.corners, 0)
})

test('saved shots can be parried behind for corners', () => {
  const attackingTeam = team('Attack', 'A', [player({ position: 'GK', originPOS: [50, 0], currentPOS: [50, 0] }), player({ playerID: 'A2' }), player({ playerID: 'A3' }), player({ playerID: 'A4' }), player({ playerID: 'A5' }), player({ playerID: 'A6' }), player({ playerID: 'A7' }), player({ playerID: 'A8' }), player({ playerID: 'A9' }), player({ playerID: 'A10' }), player({ playerID: 'A11' })])
  const keeper = player({ playerID: 'B1', name: 'Keeper', position: 'GK', originPOS: [50, 100], currentPOS: [50, 100], skill: { strength: 80, jumping: 70, passing: 80, crossing: 80, shooting: 80, saving: 100, control: 80, perception: 80 } })
  const defendingTeam = team('Defence', 'B', [keeper, player({ playerID: 'B2' }), player({ playerID: 'B3' }), player({ playerID: 'B4' }), player({ playerID: 'B5' }), player({ playerID: 'B6' }), player({ playerID: 'B7' }), player({ playerID: 'B8' }), player({ playerID: 'B9' }), player({ playerID: 'B10' }), player({ playerID: 'B11' })])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    ball: { position: [50, 99, 0], lastTouch: { teamID: attackingTeam.teamID, action: 'shot', shotOnTarget: true }, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  withRandomSequence([0.1, 0.1], () => {
    setPositions.keepInBoundaries(matchDetails, attackingTeam.teamID, [50, 101, 0])
  })

  assert.ok(matchDetails.iterationLog.some(message => /^Corner to - Attack$/.test(message)))
  assert.equal(matchDetails.kickOffTeamStatistics.corners, 1)
})

test('deflected wide shots over the defending goal line award corners', () => {
  const attackingTeam = team('Attack', 'A', [player({ position: 'GK', originPOS: [50, 0], currentPOS: [50, 0] }), player({ playerID: 'A2' }), player({ playerID: 'A3' }), player({ playerID: 'A4' }), player({ playerID: 'A5' }), player({ playerID: 'A6' }), player({ playerID: 'A7' }), player({ playerID: 'A8' }), player({ playerID: 'A9' }), player({ playerID: 'A10' }), player({ playerID: 'A11' })])
  const defendingTeam = team('Defence', 'B', [player({ playerID: 'B1', position: 'GK', originPOS: [50, 100], currentPOS: [50, 100] }), player({ playerID: 'B2' }), player({ playerID: 'B3' }), player({ playerID: 'B4' }), player({ playerID: 'B5' }), player({ playerID: 'B6' }), player({ playerID: 'B7' }), player({ playerID: 'B8' }), player({ playerID: 'B9' }), player({ playerID: 'B10' }), player({ playerID: 'B11' })])
  const matchDetails = {
    pitchSize: [100, 100, 20],
    ball: { position: [10, 99, 0], lastTouch: {}, ballOverIterations: [] },
    kickOffTeam: attackingTeam,
    secondTeam: defendingTeam,
    kickOffTeamStatistics: stats(),
    secondTeamStatistics: stats(),
    iterationLog: []
  }

  setPositions.keepInBoundaries(matchDetails, defendingTeam.teamID, [10, 101, 0])

  assert.ok(matchDetails.iterationLog.some(message => /^Corner to - Attack$/.test(message)))
  assert.equal(matchDetails.kickOffTeamStatistics.corners, 1)
})
