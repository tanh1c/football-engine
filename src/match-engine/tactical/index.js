'use strict'

const { classifyPhase } = require('./phase')
const { calculatePressure } = require('./pressure')
const { rankPassOptions } = require('./passOptions')
const { estimateShotQuality } = require('./shotQuality')
const { calculateFormationTargets } = require('./formation')
const { estimateInterceptions } = require('./intercept')
const { assignPressing } = require('./pressing')
const { recommendActions } = require('./actionScoring')

function analyzeTactics(matchDetails) {
  const base = {
    phase: classifyPhase(matchDetails),
    possessionTeamId: matchDetails.ball?.withTeam ? String(matchDetails.ball.withTeam) : undefined,
    pressure: calculatePressure(matchDetails)
  }
  base.passOptions = rankPassOptions(matchDetails)
  base.shotQuality = estimateShotQuality(matchDetails, base.pressure)
  base.formationTargets = calculateFormationTargets(matchDetails, base)
  base.intercepts = estimateInterceptions(matchDetails)
  base.pressing = assignPressing(matchDetails, base)
  base.actionRecommendations = recommendActions(matchDetails, base)
  return base
}

module.exports = {
  analyzeTactics,
  classifyPhase,
  calculatePressure,
  rankPassOptions,
  estimateShotQuality,
  calculateFormationTargets,
  estimateInterceptions,
  assignPressing,
  recommendActions
}
