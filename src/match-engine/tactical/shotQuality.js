'use strict'

const { distance } = require('./pressure')

function getTeam(matchDetails, teamId) {
  if (matchDetails.kickOffTeam?.teamID === teamId) return matchDetails.kickOffTeam
  if (matchDetails.secondTeam?.teamID === teamId) return matchDetails.secondTeam
  return undefined
}

function attacksTowardBottom(matchDetails, team) {
  return team?.teamID === matchDetails.kickOffTeam?.teamID
}

function estimateShotQuality(matchDetails, pressure = { score: 0 }) {
  const ball = matchDetails.ball ?? {}
  if (!ball.withPlayer || !ball.withTeam) return undefined

  const [pitchWidth, pitchHeight] = matchDetails.pitchSize ?? [100, 100]
  const team = getTeam(matchDetails, ball.withTeam)
  const carrier = team?.players?.find(player => player.playerID === ball.Player)
  if (!team || !carrier) return undefined

  const goal = attacksTowardBottom(matchDetails, team) ? [pitchWidth / 2, pitchHeight] : [pitchWidth / 2, 0]
  const shotDistance = distance(carrier.currentPOS, goal)
  const centrality = Math.max(0, 1 - (Math.abs(carrier.currentPOS[0] - goal[0]) / (pitchWidth / 2)))
  const distanceScore = Math.max(0, 1 - (shotDistance / pitchHeight))
  const skillScore = Math.max(0, Math.min(1, Number(carrier.skill?.shooting ?? 60) / 100))
  const pressurePenalty = Math.max(0, Math.min(1, pressure.score ?? 0)) * 0.35
  const xg = Math.max(0.01, Math.min(0.75, (distanceScore * 0.5) + (centrality * 0.25) + (skillScore * 0.15) - pressurePenalty))

  return {
    playerId: String(carrier.playerID),
    xg: Number(xg.toFixed(3)),
    distance: Number(shotDistance.toFixed(3)),
    centrality: Number(centrality.toFixed(3)),
    pressure: Number((pressure.score ?? 0).toFixed(3))
  }
}

module.exports = {
  estimateShotQuality
}
