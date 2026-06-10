'use strict'

const { distance } = require('./pressure')
const { effectiveSpeed } = require('./stamina')

function activePlayers(team) {
  return (team?.players ?? []).filter(player => Array.isArray(player.currentPOS) && player.currentPOS[0] !== 'NP')
}

function estimateInterceptions(matchDetails) {
  const ballPosition = matchDetails.ball?.position ?? [0, 0]
  const estimates = [matchDetails.kickOffTeam, matchDetails.secondTeam]
    .flatMap(team => activePlayers(team).map(player => {
      const reachTicks = Math.ceil(distance(player.currentPOS, ballPosition) / effectiveSpeed(player))
      return {
        playerId: String(player.playerID),
        teamId: String(team.teamID),
        reachTicks,
        target: { x: Number(ballPosition[0]), y: Number(ballPosition[1]) }
      }
    }))
    .sort((a, b) => a.reachTicks - b.reachTicks)

  return estimates.map((estimate, index) => ({ ...estimate, rank: index + 1 }))
}

module.exports = {
  estimateInterceptions
}
