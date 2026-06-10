'use strict'

const { distance } = require('./pressure')

function getTeam(matchDetails, teamId) {
  if (matchDetails.kickOffTeam?.teamID === teamId) return matchDetails.kickOffTeam
  if (matchDetails.secondTeam?.teamID === teamId) return matchDetails.secondTeam
  return undefined
}

function getOpposition(matchDetails, teamId) {
  if (matchDetails.kickOffTeam?.teamID === teamId) return matchDetails.secondTeam
  if (matchDetails.secondTeam?.teamID === teamId) return matchDetails.kickOffTeam
  return undefined
}

function attacksTowardBottom(matchDetails, team) {
  const firstPlayer = team?.players?.find(player => Array.isArray(player.originPOS))
  if (!firstPlayer) return team?.teamID === matchDetails.kickOffTeam?.teamID
  return firstPlayer.originPOS[1] <= matchDetails.pitchSize[1] / 2
}

function nearestOpponentDistance(point, opposition) {
  return Math.min(...(opposition?.players ?? [])
    .filter(player => Array.isArray(player.currentPOS) && player.currentPOS[0] !== 'NP')
    .map(player => distance(point, player.currentPOS)), Infinity)
}

function rankPassOptions(matchDetails, limit = 5) {
  const ball = matchDetails.ball ?? {}
  if (!ball.withPlayer || !ball.withTeam) return []

  const team = getTeam(matchDetails, ball.withTeam)
  const opposition = getOpposition(matchDetails, ball.withTeam)
  const carrier = team?.players?.find(player => player.playerID === ball.Player)
  if (!team || !carrier) return []

  const [, pitchHeight] = matchDetails.pitchSize ?? [100, 100]
  const attackingBottom = attacksTowardBottom(matchDetails, team)

  return team.players
    .filter(player => player.playerID !== carrier.playerID && Array.isArray(player.currentPOS) && player.currentPOS[0] !== 'NP')
    .map(player => {
      const passDistance = distance(carrier.currentPOS, player.currentPOS)
      const progress = attackingBottom
        ? (player.currentPOS[1] - carrier.currentPOS[1]) / pitchHeight
        : (carrier.currentPOS[1] - player.currentPOS[1]) / pitchHeight
      const receiverPressureDistance = nearestOpponentDistance(player.currentPOS, opposition)
      const safety = Math.min(1, receiverPressureDistance / 20)
      const distancePenalty = Math.min(0.4, passDistance / 150)
      const score = Math.max(0, Math.min(1, (0.45 * safety) + (0.45 * Math.max(0, progress)) + 0.2 - distancePenalty))

      return {
        playerId: String(player.playerID),
        playerName: player.name,
        score: Number(score.toFixed(3)),
        distance: Number(passDistance.toFixed(3)),
        progress: Number(progress.toFixed(3)),
        receiverPressure: Number((1 - safety).toFixed(3))
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

module.exports = {
  rankPassOptions
}
