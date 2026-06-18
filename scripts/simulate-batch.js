#!/usr/bin/env node
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { simulateFullMatch, simulateMatch } = require('../src/match-engine')

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'))
}

function demoInput(seed, secondsPerTick = 1) {
  return {
    homeTeam: readJson('vendor/footballSimulationEngine/init_config/team1.json'),
    awayTeam: readJson('vendor/footballSimulationEngine/init_config/team2.json'),
    pitch: readJson('vendor/footballSimulationEngine/init_config/pitch.json'),
    seed,
    secondsPerTick
  }
}

function totalStat(finalStats, key) {
  return Number(finalStats?.kickOffTeam?.[key] ?? 0) + Number(finalStats?.secondTeam?.[key] ?? 0)
}

function totalNestedStat(finalStats, key, nestedKey) {
  return Number(finalStats?.kickOffTeam?.[key]?.[nestedKey] ?? 0) + Number(finalStats?.secondTeam?.[key]?.[nestedKey] ?? 0)
}

function average(values) {
  if (values.length === 0) return 0
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
}

function ratio(numerator, denominator) {
  if (denominator <= 0) return 0
  return Number((numerator / denominator).toFixed(2))
}

function totalEventCount(events = [], type) {
  return events.filter(event => event.type === type).length
}

function totalXg(events = []) {
  return Number(events.reduce((sum, event) => sum + Number(event.xg ?? 0), 0).toFixed(2))
}

function countEventsByTypes(events = [], types) {
  const typeSet = new Set(types)
  return events.filter(event => typeSet.has(event.type)).length
}

function eventVariety(events = []) {
  return new Set(events.map(event => event.type).filter(Boolean)).size
}

function eventShare(events = [], types) {
  if (events.length === 0) return 0
  return ratio(countEventsByTypes(events, types), events.length)
}

function countEventInvariants(events = []) {
  const shotById = new Map()
  const terminalEventsByShotId = new Map()
  const invariants = {
    sameTeamSaveEvents: 0,
    selfSaveEvents: 0,
    missingShotLinkEvents: 0,
    staleShotLinkEvents: 0,
    multiTerminalShotEvents: 0,
    goalXgMismatchEvents: 0
  }

  for (const event of events) {
    if (event.type === 'shot' && event.id) shotById.set(event.id, event)
  }

  for (const event of events) {
    if (!['save', 'goal', 'blocked_shot'].includes(event.type)) continue

    if (!event.shotId) {
      invariants.missingShotLinkEvents++
      continue
    }

    const shot = shotById.get(event.shotId)
    if (!shot) {
      invariants.missingShotLinkEvents++
      continue
    }

    const tickDistance = Math.abs(Number(event.tick ?? 0) - Number(shot.tick ?? 0))
    if (tickDistance > 30) invariants.staleShotLinkEvents++

    const terminals = terminalEventsByShotId.get(event.shotId) ?? []
    terminals.push(event)
    terminalEventsByShotId.set(event.shotId, terminals)

    if (event.type === 'save') {
      if (String(event.teamId) === String(shot.teamId)) invariants.sameTeamSaveEvents++
      if (String(event.playerId) === String(shot.playerId)) invariants.selfSaveEvents++
    }

    if (event.type === 'goal' && event.xg !== undefined && shot.xg !== undefined) {
      if (Number(event.xg) !== Number(shot.xg)) invariants.goalXgMismatchEvents++
    }
  }

  for (const terminals of terminalEventsByShotId.values()) {
    if (terminals.length > 1) invariants.multiTerminalShotEvents += terminals.length - 1
  }

  return invariants
}

function conversionMetrics(result) {
  const goals = totalStat(result.finalStats, 'goals')
  const saves = totalEventCount(result.events, 'save')
  const shotsOnTarget = Math.max(totalNestedStat(result.finalStats, 'shots', 'on'), goals + saves)
  const xg = totalXg(result.events)

  return {
    shotsOnTarget,
    saves,
    goalOnTargetRate: ratio(goals, shotsOnTarget),
    savePercentage: ratio(saves, shotsOnTarget),
    xg,
    goalsMinusXg: Number((goals - xg).toFixed(2))
  }
}

function realism(summary) {
  const stable = summary.crashes === 0
  const minAvgGoals = summary.completed < 5 ? 1.2 : 1.8
  const plausibleGoals = summary.avgGoals >= minAvgGoals && summary.avgGoals <= 3.8
  const plausibleShots = summary.avgShots >= 16 && summary.avgShots <= 35
  const enoughCorners = summary.avgCorners >= 0.3
  const enoughFouls = summary.avgFouls >= 2.5
  const enoughEvents = summary.avgEvents >= 80
  const cleanOwnership = summary.badOwnershipFrames === 0
  const cleanCoordinates = summary.impossibleCoordinateFrames === 0
  const monotonicTimeline = summary.duplicateAbsoluteTicks === 0
  const cleanMovement = summary.largeUnexplainedJumps === 0
  const minGoalsMinusXg = summary.completed < 5 ? -2 : -1.5
  const plausibleConversion = summary.avgGoalOnTargetRate <= 0.65 && summary.avgGoalsMinusXg >= minGoalsMinusXg
  const saveGateApplies = summary.completed >= 5 || summary.avgShotsOnTarget >= 6
  const plausibleSaveRate = !saveGateApplies || (summary.avgSavePercentage >= 0.3 && summary.avgSavePercentage <= 0.85)
  const enoughEventVariety = summary.eventVariety >= 4
  const balancedCarryEvents = summary.avgCarryEventShare <= 0.35
  const singleBallHolder = summary.multiHolderFrames === 0
  const cleanShotSemantics =
    summary.sameTeamSaveEvents === 0 &&
    summary.selfSaveEvents === 0 &&
    summary.missingShotLinkEvents === 0 &&
    summary.staleShotLinkEvents === 0 &&
    summary.multiTerminalShotEvents === 0 &&
    summary.goalXgMismatchEvents === 0

  return {
    stable,
    plausibleGoals,
    plausibleShots,
    enoughCorners,
    enoughFouls,
    enoughEvents,
    cleanOwnership,
    cleanCoordinates,
    monotonicTimeline,
    cleanMovement,
    plausibleConversion,
    plausibleSaveRate,
    enoughEventVariety,
    balancedCarryEvents,
    singleBallHolder,
    cleanShotSemantics,
    passes: stable && plausibleGoals && plausibleShots && enoughCorners && enoughFouls && enoughEvents && cleanOwnership && cleanCoordinates && monotonicTimeline && cleanMovement && plausibleConversion && plausibleSaveRate && enoughEventVariety && balancedCarryEvents && singleBallHolder && cleanShotSemantics
  }
}

function totalInvariant(results, key) {
  return results.reduce((sum, result) => sum + Number(result.invariants?.[key] ?? 0), 0)
}

function frameKey(frame) {
  return frame.absoluteTick ?? frame.frameIndex ?? frame.tick
}

function playerDistance(previousPlayer, player) {
  const dx = Number(player.x) - Number(previousPlayer.x)
  const dy = Number(player.y) - Number(previousPlayer.y)
  return Math.sqrt((dx * dx) + (dy * dy))
}

function frameHasLargePlayerJump(previous, frame) {
  const previousPlayers = new Map((previous.players ?? []).map(player => [player.id, player]))
  return (frame.players ?? []).some(player => {
    const before = previousPlayers.get(player.id)
    return before && playerDistance(before, player) > 35
  })
}

function frameHasResetEvent(frame) {
  return (frame.events ?? []).some(event => event.type === 'set_piece' || event.type === 'goal' || /kick off|second half/i.test(event.message ?? ''))
}

function streamingFrameNormalizer() {
  let index = 0
  let previous
  return frame => {
    const current = { ...frame, frameIndex: index, absoluteTick: index }
    index++
    const previousHalf = Number(previous?.half)
    const currentHalf = Number(current.half)
    if (Number.isFinite(previousHalf) && Number.isFinite(currentHalf) && currentHalf !== previousHalf) {
      current.discontinuity = { type: 'half_time_reset', interpolate: false }
    } else if (previous && frameHasResetEvent(current) && frameHasLargePlayerJump(previous, current)) {
      current.discontinuity = { type: 'set_piece_reset', interpolate: false }
    }
    previous = current
    return current
  }
}

function createFrameInvariantCounter() {
  const seenTicks = new Set()
  const previousPlayers = new Map()
  const invariants = {
    badOwnershipFrames: 0,
    impossibleCoordinateFrames: 0,
    duplicateAbsoluteTicks: 0,
    largeUnexplainedJumps: 0,
    multiHolderFrames: 0
  }

  return {
    update(frame) {
      const key = frameKey(frame)
      if (seenTicks.has(key)) invariants.duplicateAbsoluteTicks++
      seenTicks.add(key)

      const pitchWidth = Number(frame.pitch?.width ?? Infinity)
      const pitchHeight = Number(frame.pitch?.height ?? Infinity)
      const players = frame.players ?? []
      const ownerId = frame.ball?.ownerPlayerId
      const holders = players.filter(player => player.hasBall)
      if (ownerId && !players.some(player => String(player.id) === String(ownerId))) invariants.badOwnershipFrames++
      if (holders.length > 1) invariants.multiHolderFrames++

      if (players.some(player => !Number.isFinite(Number(player.x)) || !Number.isFinite(Number(player.y)) || Number(player.x) < -1 || Number(player.y) < -1 || Number(player.x) > pitchWidth + 1 || Number(player.y) > pitchHeight + 1)) {
        invariants.impossibleCoordinateFrames++
      }

      const hasReset = Boolean(frame.discontinuity)
      for (const player of players) {
        const previous = previousPlayers.get(player.id)
        if (previous && !hasReset && playerDistance(previous, player) > 35) invariants.largeUnexplainedJumps++
        previousPlayers.set(player.id, player)
      }
    },
    result() {
      return { ...invariants }
    }
  }
}

function countFrameInvariants(frames = []) {
  const counter = createFrameInvariantCounter()
  for (const frame of frames) counter.update(frame)
  return counter.result()
}

function summarizeBatchResults(results) {
  const completedResults = results.filter(result => result.ok)
  const conversions = completedResults.map(conversionMetrics)
  const eventInvariants = completedResults.map(result => countEventInvariants(result.events))
  const totalEventInvariant = key => eventInvariants.reduce((sum, invariants) => sum + Number(invariants[key] ?? 0), 0)
  const summary = {
    matches: results.length,
    completed: completedResults.length,
    crashes: results.length - completedResults.length,
    avgGoals: average(completedResults.map(result => totalStat(result.finalStats, 'goals'))),
    avgShots: average(completedResults.map(result => totalNestedStat(result.finalStats, 'shots', 'total'))),
    avgShotsOnTarget: average(conversions.map(metrics => metrics.shotsOnTarget)),
    avgCorners: average(completedResults.map(result => totalStat(result.finalStats, 'corners'))),
    avgFouls: average(completedResults.map(result => totalStat(result.finalStats, 'fouls'))),
    avgSaves: average(conversions.map(metrics => metrics.saves)),
    avgGoalOnTargetRate: average(conversions.map(metrics => metrics.goalOnTargetRate)),
    avgSavePercentage: average(conversions.map(metrics => metrics.savePercentage)),
    avgXg: average(conversions.map(metrics => metrics.xg)),
    avgGoalsMinusXg: average(conversions.map(metrics => metrics.goalsMinusXg)),
    avgEvents: average(completedResults.map(result => result.events.length)),
    avgDefensiveEvents: average(completedResults.map(result => countEventsByTypes(result.events, ['interception', 'clearance', 'blocked_shot', 'tackle']))),
    avgCarryEvents: average(completedResults.map(result => countEventsByTypes(result.events, ['dribble']))),
    avgCarryEventShare: average(completedResults.map(result => eventShare(result.events, ['dribble']))),
    eventVariety: average(completedResults.map(result => eventVariety(result.events))),
    badOwnershipFrames: totalInvariant(completedResults, 'badOwnershipFrames'),
    impossibleCoordinateFrames: totalInvariant(completedResults, 'impossibleCoordinateFrames'),
    duplicateAbsoluteTicks: totalInvariant(completedResults, 'duplicateAbsoluteTicks'),
    largeUnexplainedJumps: totalInvariant(completedResults, 'largeUnexplainedJumps'),
    multiHolderFrames: totalInvariant(completedResults, 'multiHolderFrames'),
    sameTeamSaveEvents: totalEventInvariant('sameTeamSaveEvents'),
    selfSaveEvents: totalEventInvariant('selfSaveEvents'),
    missingShotLinkEvents: totalEventInvariant('missingShotLinkEvents'),
    staleShotLinkEvents: totalEventInvariant('staleShotLinkEvents'),
    multiTerminalShotEvents: totalEventInvariant('multiTerminalShotEvents'),
    goalXgMismatchEvents: totalEventInvariant('goalXgMismatchEvents')
  }
  summary.realism = realism(summary)
  return summary
}

function optionNumber(argv, flag, defaultValue) {
  const index = argv.indexOf(flag)
  if (index < 0) return defaultValue
  return Number(argv[index + 1] ?? defaultValue)
}

function parseArgs(argv) {
  const count = Number(argv[2] ?? 20)
  return {
    count,
    full: argv.includes('--full'),
    ticks: optionNumber(argv, '--ticks', 900),
    secondsPerTick: optionNumber(argv, '--seconds-per-tick', 1)
  }
}

async function runBatch(options) {
  const results = []
  for (let index = 0; index < options.count; index++) {
    const seed = `batch-${index}`
    try {
      const input = demoInput(seed, options.secondsPerTick)
      const invariantCounter = createFrameInvariantCounter()
      const normalizeFrame = streamingFrameNormalizer()
      const result = options.full
        ? await simulateFullMatch(input, { includeState: false, collectFrames: false, onFrame: frame => invariantCounter.update(normalizeFrame(frame)) })
        : await simulateMatch(input, { ticks: options.ticks, includeState: false, collectFrames: false, onFrame: frame => invariantCounter.update(normalizeFrame(frame)) })
      results.push({ seed, ok: true, finalStats: result.finalStats, events: result.events, invariants: invariantCounter.result() })
    } catch (error) {
      results.push({ seed, ok: false, error: error.message })
    }
  }
  return results
}

function printSummary(summary, results) {
  console.log(`matches: ${summary.matches}`)
  console.log(`completed: ${summary.completed}`)
  console.log(`crashes: ${summary.crashes}`)
  console.log(`avg goals: ${summary.avgGoals}`)
  console.log(`avg shots: ${summary.avgShots}`)
  console.log(`avg shots on target: ${summary.avgShotsOnTarget}`)
  console.log(`avg corners: ${summary.avgCorners}`)
  console.log(`avg fouls: ${summary.avgFouls}`)
  console.log(`avg saves: ${summary.avgSaves}`)
  console.log(`avg goal/on-target rate: ${summary.avgGoalOnTargetRate}`)
  console.log(`avg save percentage: ${summary.avgSavePercentage}`)
  console.log(`avg xG: ${summary.avgXg}`)
  console.log(`avg goals - xG: ${summary.avgGoalsMinusXg}`)
  console.log(`avg events: ${summary.avgEvents}`)
  console.log(`avg defensive events: ${summary.avgDefensiveEvents}`)
  console.log(`avg carry events: ${summary.avgCarryEvents}`)
  console.log(`avg carry event share: ${summary.avgCarryEventShare}`)
  console.log(`event variety: ${summary.eventVariety}`)
  console.log(`bad ownership frames: ${summary.badOwnershipFrames}`)
  console.log(`impossible coordinate frames: ${summary.impossibleCoordinateFrames}`)
  console.log(`duplicate absolute ticks: ${summary.duplicateAbsoluteTicks}`)
  console.log(`large unexplained jumps: ${summary.largeUnexplainedJumps}`)
  console.log(`multi holder frames: ${summary.multiHolderFrames}`)
  console.log(`same team save events: ${summary.sameTeamSaveEvents}`)
  console.log(`self save events: ${summary.selfSaveEvents}`)
  console.log(`missing shot links: ${summary.missingShotLinkEvents}`)
  console.log(`stale shot links: ${summary.staleShotLinkEvents}`)
  console.log(`multi terminal shot events: ${summary.multiTerminalShotEvents}`)
  console.log(`goal xG mismatch events: ${summary.goalXgMismatchEvents}`)
  console.log(`realism stable: ${summary.realism.stable}`)
  console.log(`realism goals: ${summary.realism.plausibleGoals}`)
  console.log(`realism shots: ${summary.realism.plausibleShots}`)
  console.log(`realism corners: ${summary.realism.enoughCorners}`)
  console.log(`realism fouls: ${summary.realism.enoughFouls}`)
  console.log(`realism events: ${summary.realism.enoughEvents}`)
  console.log(`realism ownership: ${summary.realism.cleanOwnership}`)
  console.log(`realism coordinates: ${summary.realism.cleanCoordinates}`)
  console.log(`realism timeline: ${summary.realism.monotonicTimeline}`)
  console.log(`realism movement: ${summary.realism.cleanMovement}`)
  console.log(`realism conversion: ${summary.realism.plausibleConversion}`)
  console.log(`realism event variety: ${summary.realism.enoughEventVariety}`)
  console.log(`realism carry balance: ${summary.realism.balancedCarryEvents}`)
  console.log(`realism single holder: ${summary.realism.singleBallHolder}`)
  console.log(`realism shot semantics: ${summary.realism.cleanShotSemantics}`)
  console.log(`realism passes: ${summary.realism.passes}`)

  for (const result of results.filter(result => !result.ok)) {
    console.log(`${result.seed}: crash ${result.error}`)
  }
}

async function main() {
  const options = parseArgs(process.argv)
  const results = await runBatch(options)
  const summary = summarizeBatchResults(results)
  printSummary(summary, results)
  if (summary.crashes > 0) process.exitCode = 1
}

if (require.main === module) {
  main().catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}

module.exports = {
  countEventInvariants,
  countFrameInvariants,
  createFrameInvariantCounter,
  parseArgs,
  runBatch,
  summarizeBatchResults
}
