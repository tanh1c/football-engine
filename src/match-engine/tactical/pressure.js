'use strict'

function distance(a, b) {
  const dx = Number(a[0]) - Number(b[0])
  const dy = Number(a[1]) - Number(b[1])
  return Math.sqrt((dx * dx) + (dy * dy))
}

function activePlayers(team) {
  return (team?.players ?? []).filter(player => Array.isArray(player.currentPOS) && player.currentPOS[0] !== 'NP')
}

function opponentPlayers(matchDetails, possessionTeamId) {
  const teams = [matchDetails.kickOffTeam, matchDetails.secondTeam]
  return teams
    .filter(team => String(team?.teamID) !== String(possessionTeamId))
    .flatMap(activePlayers)
}

function calculatePressure(matchDetails) {
  const ball = matchDetails.ball ?? {}
  const point = Array.isArray(ball.position) ? ball.position : [0, 0]
  const opponents = opponentPlayers(matchDetails, ball.withTeam)

  let nearestOpponentId
  let nearestDistance = Infinity
  let closeOpponents = 0
  let nearbyOpponents = 0

  for (const opponent of opponents) {
    const opponentDistance = distance(point, opponent.currentPOS)
    if (opponentDistance < nearestDistance) {
      nearestDistance = opponentDistance
      nearestOpponentId = String(opponent.playerID)
    }
    if (opponentDistance <= 5) closeOpponents++
    if (opponentDistance <= 12) nearbyOpponents++
  }

  const proximityScore = nearestDistance === Infinity ? 0 : Math.max(0, 1 - (nearestDistance / 20))
  const densityScore = Math.min(1, (closeOpponents * 0.25) + (nearbyOpponents * 0.1))
  const score = Math.max(0, Math.min(1, Number((proximityScore + densityScore).toFixed(3))))

  return {
    score,
    nearestOpponentId,
    nearestDistance: nearestDistance === Infinity ? undefined : Number(nearestDistance.toFixed(3)),
    closeOpponents,
    nearbyOpponents
  }
}

module.exports = {
  calculatePressure,
  distance
}
