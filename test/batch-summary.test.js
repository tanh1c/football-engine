'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { countFrameInvariants, createFrameInvariantCounter, parseArgs, runBatch, summarizeBatchResults } = require('../scripts/simulate-batch')

test('parseArgs keeps default tick and seconds values when optional flags are omitted', () => {
  const result = parseArgs(['node', 'scripts/simulate-batch.js', '5', '--full'])

  assert.equal(result.count, 5)
  assert.equal(result.full, true)
  assert.equal(result.ticks, 900)
  assert.equal(result.secondsPerTick, 1)
})

test('full-match batch smoke satisfies realism gates', async () => {
  const results = await runBatch({ count: 3, full: true, ticks: 900, secondsPerTick: 1 })
  const summary = summarizeBatchResults(results)

  assert.deepEqual(summary.realism, {
    stable: true,
    plausibleGoals: true,
    plausibleShots: true,
    enoughCorners: true,
    enoughFouls: true,
    enoughEvents: true,
    cleanOwnership: true,
    cleanCoordinates: true,
    monotonicTimeline: true,
    cleanMovement: true,
    plausibleConversion: true,
    plausibleSaveRate: true,
    enoughEventVariety: true,
    balancedCarryEvents: true,
    singleBallHolder: true,
    cleanShotSemantics: true,
    passes: true
  })
})

test('summarizeBatchResults reports whether realism thresholds are met', () => {
  const summary = summarizeBatchResults([
    {
      seed: 'seed-0',
      ok: true,
      finalStats: {
        kickOffTeam: { goals: 2, shots: { total: 12, on: 5 }, corners: 2, fouls: 4 },
        secondTeam: { goals: 1, shots: { total: 10, on: 3 }, corners: 1, fouls: 5 }
      },
      events: [
        ...Array.from({ length: 117 }, () => ({ type: 'pass' })),
        { id: 'shot-1', tick: 1, type: 'shot', playerId: 'A9', teamId: 'A', xg: 0.2 },
        { type: 'save', tick: 2, shotId: 'shot-1', playerId: 'B1', teamId: 'B' },
        { id: 'shot-2', tick: 3, type: 'shot', playerId: 'B9', teamId: 'B', xg: 0.2 },
        { type: 'save', tick: 4, shotId: 'shot-2', playerId: 'A1', teamId: 'A' },
        { id: 'shot-3', tick: 5, type: 'shot', playerId: 'A10', teamId: 'A', xg: 0.2 },
        { type: 'save', tick: 6, shotId: 'shot-3', playerId: 'B1', teamId: 'B' },
        { type: 'interception' }
      ],
      invariants: {
        badOwnershipFrames: 0,
        impossibleCoordinateFrames: 0,
        duplicateAbsoluteTicks: 0,
        largeUnexplainedJumps: 0
      }
    }
  ])

  assert.deepEqual(summary.realism, {
    stable: true,
    plausibleGoals: true,
    plausibleShots: true,
    enoughCorners: true,
    enoughFouls: true,
    enoughEvents: true,
    cleanOwnership: true,
    cleanCoordinates: true,
    monotonicTimeline: true,
    cleanMovement: true,
    plausibleConversion: true,
    plausibleSaveRate: true,
    enoughEventVariety: true,
    balancedCarryEvents: true,
    singleBallHolder: true,
    cleanShotSemantics: true,
    passes: true
  })
})

test('summarizeBatchResults allows low-scoring small samples within realistic variance', () => {
  const baseResult = goals => ({
    seed: `seed-${goals}`,
    ok: true,
    finalStats: {
      kickOffTeam: { goals, shots: { total: 10, on: 4 }, corners: 2, fouls: 3 },
      secondTeam: { goals: 0, shots: { total: 9, on: 3 }, corners: 1, fouls: 3 }
    },
    events: [
      ...Array.from({ length: 117 }, () => ({ type: 'pass' })),
      { type: 'shot' },
      { type: 'save' },
      { type: 'interception' }
    ],
    invariants: {
      badOwnershipFrames: 0,
      impossibleCoordinateFrames: 0,
      duplicateAbsoluteTicks: 0,
      largeUnexplainedJumps: 0,
      multiHolderFrames: 0
    }
  })

  const summary = summarizeBatchResults([baseResult(1), baseResult(2)])

  assert.equal(summary.avgGoals, 1.5)
  assert.equal(summary.realism.plausibleGoals, true)
})

test('summarizeBatchResults fails realism when shot semantic invariants fail', () => {
  const baseResult = events => ({
    seed: 'seed-0',
    ok: true,
    finalStats: {
      kickOffTeam: { goals: 2, shots: { total: 12, on: 5 }, corners: 2, fouls: 4 },
      secondTeam: { goals: 1, shots: { total: 10, on: 3 }, corners: 1, fouls: 5 }
    },
    events: [
      ...Array.from({ length: 117 }, () => ({ type: 'pass' })),
      ...events,
      { type: 'interception' },
      { type: 'clearance' },
      { type: 'dribble' }
    ],
    invariants: {
      badOwnershipFrames: 0,
      impossibleCoordinateFrames: 0,
      duplicateAbsoluteTicks: 0,
      largeUnexplainedJumps: 0,
      multiHolderFrames: 0
    }
  })

  const summary = summarizeBatchResults([
    baseResult([
      { id: 'shot-1', tick: 10, type: 'shot', playerId: 'A9', teamId: 'A', xg: 0.2 },
      { type: 'save', tick: 12, shotId: 'shot-1', playerId: 'A1', teamId: 'A' },
      { id: 'shot-2', tick: 20, type: 'shot', playerId: 'B9', teamId: 'B', xg: 0.3 },
      { type: 'save', tick: 22, shotId: 'shot-2', playerId: 'B9', teamId: 'A' },
      { type: 'goal', tick: 30 },
      { type: 'save', tick: 80, shotId: 'shot-1', playerId: 'B1', teamId: 'B' },
      { id: 'shot-3', tick: 40, type: 'shot', playerId: 'A10', teamId: 'A', xg: 0.4 },
      { type: 'save', tick: 42, shotId: 'shot-3', playerId: 'B1', teamId: 'B' },
      { type: 'blocked_shot', tick: 43, shotId: 'shot-3', playerId: 'B5', teamId: 'B' },
      { id: 'shot-4', tick: 50, type: 'shot', playerId: 'A11', teamId: 'A', xg: 0.5 },
      { type: 'goal', tick: 52, shotId: 'shot-4', playerId: 'A11', teamId: 'A', xg: 0.2 }
    ])
  ])

  assert.equal(summary.sameTeamSaveEvents, 1)
  assert.equal(summary.selfSaveEvents, 1)
  assert.equal(summary.missingShotLinkEvents, 1)
  assert.equal(summary.staleShotLinkEvents, 1)
  assert.equal(summary.multiTerminalShotEvents, 2)
  assert.equal(summary.goalXgMismatchEvents, 1)
  assert.equal(summary.realism.cleanShotSemantics, false)
  assert.equal(summary.realism.passes, false)
})

test('summarizeBatchResults fails realism when batch invariants fail', () => {
  const summary = summarizeBatchResults([
    {
      seed: 'seed-0',
      ok: true,
      finalStats: {
        kickOffTeam: { goals: 2, shots: { total: 12, on: 5 }, corners: 2, fouls: 4 },
        secondTeam: { goals: 1, shots: { total: 10, on: 3 }, corners: 1, fouls: 5 }
      },
      events: Array.from({ length: 120 }, () => ({ type: 'pass' })),
      invariants: {
        badOwnershipFrames: 1,
        impossibleCoordinateFrames: 1,
        duplicateAbsoluteTicks: 1,
        largeUnexplainedJumps: 1,
        multiHolderFrames: 1
      }
    }
  ])

  assert.equal(summary.badOwnershipFrames, 1)
  assert.equal(summary.impossibleCoordinateFrames, 1)
  assert.equal(summary.duplicateAbsoluteTicks, 1)
  assert.equal(summary.largeUnexplainedJumps, 1)
  assert.equal(summary.multiHolderFrames, 1)
  assert.equal(summary.realism.cleanOwnership, false)
  assert.equal(summary.realism.cleanCoordinates, false)
  assert.equal(summary.realism.monotonicTimeline, false)
  assert.equal(summary.realism.cleanMovement, false)
  assert.equal(summary.realism.singleBallHolder, false)
  assert.equal(summary.realism.passes, false)
})

test('countFrameInvariants ignores large jumps on discontinuity frames', () => {
  const frames = [
    {
      absoluteTick: 0,
      pitch: { width: 100, height: 100 },
      ball: {},
      players: [{ id: 'A1', x: 10, y: 10 }]
    },
    {
      absoluteTick: 1,
      pitch: { width: 100, height: 100 },
      ball: {},
      discontinuity: { type: 'set_piece_reset', interpolate: false },
      players: [{ id: 'A1', x: 90, y: 90 }]
    }
  ]

  assert.equal(countFrameInvariants(frames).largeUnexplainedJumps, 0)
})

test('countFrameInvariants counts frames with multiple ball holders', () => {
  const frames = [
    {
      absoluteTick: 0,
      pitch: { width: 100, height: 100 },
      ball: { ownerPlayerId: 'A1' },
      players: [
        { id: 'A1', x: 10, y: 10, hasBall: true },
        { id: 'A2', x: 12, y: 10, hasBall: true }
      ]
    }
  ]

  assert.equal(countFrameInvariants(frames).multiHolderFrames, 1)
})

test('countFrameInvariants counts large jumps without discontinuity markers', () => {
  const frames = [
    {
      absoluteTick: 0,
      pitch: { width: 100, height: 100 },
      ball: {},
      players: [{ id: 'A1', x: 10, y: 10 }]
    },
    {
      absoluteTick: 1,
      pitch: { width: 100, height: 100 },
      ball: {},
      players: [{ id: 'A1', x: 90, y: 90 }]
    }
  ]

  assert.equal(countFrameInvariants(frames).largeUnexplainedJumps, 1)
})

test('createFrameInvariantCounter matches batch frame invariant counting', () => {
  const frames = [
    {
      absoluteTick: 0,
      pitch: { width: 100, height: 100 },
      ball: { ownerPlayerId: 'A1' },
      players: [{ id: 'A1', x: 10, y: 10, hasBall: true }]
    },
    {
      absoluteTick: 1,
      pitch: { width: 100, height: 100 },
      ball: { ownerPlayerId: 'A1' },
      players: [
        { id: 'A1', x: 90, y: 90, hasBall: true },
        { id: 'A2', x: 12, y: 10, hasBall: true }
      ]
    }
  ]
  const counter = createFrameInvariantCounter()
  for (const frame of frames) counter.update(frame)

  assert.deepEqual(counter.result(), countFrameInvariants(frames))
})

test('summarizeBatchResults aggregates crashes and match metrics', () => {
  const summary = summarizeBatchResults([
    {
      seed: 'seed-0',
      ok: true,
      finalStats: {
        kickOffTeam: { goals: 2, shots: { total: 10 }, corners: 3, fouls: 4 },
        secondTeam: { goals: 1, shots: { total: 6 }, corners: 1, fouls: 5 }
      },
      events: [
        { type: 'pass' },
        { type: 'shot' },
        { type: 'set_piece', message: 'Corner to - A' }
      ]
    },
    { seed: 'seed-1', ok: false, error: 'boom' }
  ])

  assert.equal(summary.matches, 2)
  assert.equal(summary.completed, 1)
  assert.equal(summary.crashes, 1)
  assert.equal(summary.avgGoals, 3)
  assert.equal(summary.avgShots, 16)
  assert.equal(summary.avgCorners, 4)
  assert.equal(summary.avgFouls, 9)
  assert.equal(summary.avgEvents, 3)
})

test('summarizeBatchResults reports conversion and save quality metrics', () => {
  const summary = summarizeBatchResults([
    {
      seed: 'seed-0',
      ok: true,
      finalStats: {
        kickOffTeam: { goals: 1, shots: { total: 10, on: 4 }, corners: 2, fouls: 3 },
        secondTeam: { goals: 2, shots: { total: 8, on: 3 }, corners: 1, fouls: 4 }
      },
      events: [
        { type: 'shot', xg: 0.4 },
        { type: 'shot', xg: 0.2 },
        { type: 'save' },
        { type: 'save' },
        { type: 'pass' }
      ],
      invariants: {
        badOwnershipFrames: 0,
        impossibleCoordinateFrames: 0,
        duplicateAbsoluteTicks: 0,
        largeUnexplainedJumps: 0
      }
    }
  ])

  assert.equal(summary.avgShotsOnTarget, 7)
  assert.equal(summary.avgSaves, 2)
  assert.equal(summary.avgGoalOnTargetRate, 0.43)
  assert.equal(summary.avgSavePercentage, 0.29)
  assert.equal(summary.avgXg, 0.6)
  assert.equal(summary.avgGoalsMinusXg, 2.4)
})

test('summarizeBatchResults treats saved shots as on-target attempts when vendor shot stats undercount them', () => {
  const summary = summarizeBatchResults([
    {
      seed: 'seed-0',
      ok: true,
      finalStats: {
        kickOffTeam: { goals: 1, shots: { total: 8, on: 1 }, corners: 2, fouls: 3 },
        secondTeam: { goals: 0, shots: { total: 7, on: 0 }, corners: 1, fouls: 4 }
      },
      events: [{ type: 'save' }, { type: 'save' }],
      invariants: {
        badOwnershipFrames: 0,
        impossibleCoordinateFrames: 0,
        duplicateAbsoluteTicks: 0,
        largeUnexplainedJumps: 0
      }
    }
  ])

  assert.equal(summary.avgShotsOnTarget, 3)
  assert.equal(summary.avgGoalOnTargetRate, 0.33)
  assert.equal(summary.avgSavePercentage, 0.67)
})

test('summarizeBatchResults reports football event variety metrics', () => {
  const summary = summarizeBatchResults([
    {
      seed: 'seed-0',
      ok: true,
      finalStats: {
        kickOffTeam: { goals: 1, shots: { total: 10, on: 4 }, corners: 2, fouls: 4 },
        secondTeam: { goals: 1, shots: { total: 8, on: 3 }, corners: 1, fouls: 4 }
      },
      events: [
        { type: 'pass' },
        { type: 'shot' },
        { type: 'save' },
        { type: 'interception' },
        { type: 'clearance' },
        { type: 'blocked_shot' },
        { type: 'dribble' },
        { type: 'foul' }
      ],
      invariants: {
        badOwnershipFrames: 0,
        impossibleCoordinateFrames: 0,
        duplicateAbsoluteTicks: 0,
        largeUnexplainedJumps: 0
      }
    }
  ])

  assert.equal(summary.avgDefensiveEvents, 3)
  assert.equal(summary.avgCarryEvents, 1)
  assert.equal(summary.eventVariety, 8)
  assert.equal(summary.realism.enoughEventVariety, true)
})

test('summarizeBatchResults fails realism when football event variety is too narrow', () => {
  const summary = summarizeBatchResults([
    {
      seed: 'seed-0',
      ok: true,
      finalStats: {
        kickOffTeam: { goals: 2, shots: { total: 12, on: 5 }, corners: 2, fouls: 4 },
        secondTeam: { goals: 1, shots: { total: 10, on: 3 }, corners: 1, fouls: 5 }
      },
      events: Array.from({ length: 120 }, () => ({ type: 'pass' })),
      invariants: {
        badOwnershipFrames: 0,
        impossibleCoordinateFrames: 0,
        duplicateAbsoluteTicks: 0,
        largeUnexplainedJumps: 0
      }
    }
  ])

  assert.equal(summary.eventVariety, 1)
  assert.equal(summary.realism.enoughEventVariety, false)
  assert.equal(summary.realism.passes, false)
})

test('summarizeBatchResults fails realism when carry events dominate the public stream', () => {
  const summary = summarizeBatchResults([
    {
      seed: 'seed-0',
      ok: true,
      finalStats: {
        kickOffTeam: { goals: 2, shots: { total: 12, on: 5 }, corners: 2, fouls: 4 },
        secondTeam: { goals: 1, shots: { total: 10, on: 3 }, corners: 1, fouls: 5 }
      },
      events: [
        ...Array.from({ length: 85 }, () => ({ type: 'dribble' })),
        ...Array.from({ length: 25 }, () => ({ type: 'pass' })),
        { type: 'shot' },
        { type: 'save' },
        { type: 'interception' },
        { type: 'clearance' },
        { type: 'foul' }
      ],
      invariants: {
        badOwnershipFrames: 0,
        impossibleCoordinateFrames: 0,
        duplicateAbsoluteTicks: 0,
        largeUnexplainedJumps: 0,
        multiHolderFrames: 0
      }
    }
  ])

  assert.equal(summary.avgCarryEventShare, 0.74)
  assert.equal(summary.realism.balancedCarryEvents, false)
  assert.equal(summary.realism.passes, false)
})

test('summarizeBatchResults fails realism when save percentage is too low', () => {
  const summary = summarizeBatchResults([
    {
      seed: 'seed-0',
      ok: true,
      finalStats: {
        kickOffTeam: { goals: 3, shots: { total: 12, on: 5 }, corners: 2, fouls: 4 },
        secondTeam: { goals: 0, shots: { total: 10, on: 3 }, corners: 1, fouls: 5 }
      },
      events: [
        ...Array.from({ length: 116 }, () => ({ type: 'pass' })),
        { type: 'shot' },
        { type: 'save' },
        { type: 'interception' },
        { type: 'clearance' }
      ],
      invariants: {
        badOwnershipFrames: 0,
        impossibleCoordinateFrames: 0,
        duplicateAbsoluteTicks: 0,
        largeUnexplainedJumps: 0,
        multiHolderFrames: 0
      }
    }
  ])

  assert.equal(summary.avgSavePercentage, 0.13)
  assert.equal(summary.realism.plausibleSaveRate, false)
  assert.equal(summary.realism.passes, false)
})

test('summarizeBatchResults fails realism when keepers save nearly everything', () => {
  const summary = summarizeBatchResults([
    {
      seed: 'seed-0',
      ok: true,
      finalStats: {
        kickOffTeam: { goals: 1, shots: { total: 12, on: 9 }, corners: 2, fouls: 4 },
        secondTeam: { goals: 0, shots: { total: 10, on: 8 }, corners: 1, fouls: 5 }
      },
      events: [
        ...Array.from({ length: 116 }, () => ({ type: 'pass' })),
        ...Array.from({ length: 16 }, () => ({ type: 'save' })),
        { type: 'shot', xg: 2.4 },
        { type: 'interception' },
        { type: 'clearance' },
        { type: 'dribble' }
      ],
      invariants: {
        badOwnershipFrames: 0,
        impossibleCoordinateFrames: 0,
        duplicateAbsoluteTicks: 0,
        largeUnexplainedJumps: 0,
        multiHolderFrames: 0
      }
    }
  ])

  assert.equal(summary.avgSavePercentage, 0.94)
  assert.equal(summary.avgGoalsMinusXg, -1.4)
  assert.equal(summary.realism.plausibleSaveRate, false)
  assert.equal(summary.realism.passes, false)
})

test('summarizeBatchResults fails realism when conversion quality is arcade-like', () => {
  const summary = summarizeBatchResults([
    {
      seed: 'seed-0',
      ok: true,
      finalStats: {
        kickOffTeam: { goals: 5, shots: { total: 12, on: 5 }, corners: 2, fouls: 4 },
        secondTeam: { goals: 1, shots: { total: 10, on: 2 }, corners: 1, fouls: 5 }
      },
      events: Array.from({ length: 120 }, () => ({ type: 'pass' })),
      invariants: {
        badOwnershipFrames: 0,
        impossibleCoordinateFrames: 0,
        duplicateAbsoluteTicks: 0,
        largeUnexplainedJumps: 0
      }
    }
  ])

  assert.equal(summary.avgGoalOnTargetRate > 0.65, true)
  assert.equal(summary.realism.plausibleConversion, false)
  assert.equal(summary.realism.passes, false)
})
