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

function activePlayers(team) {
  return (team?.players ?? []).filter(player => Array.isArray(player.currentPOS) && player.currentPOS[0] !== 'NP')
}

function assignPressing(matchDetails, tactical = {}) {
  const ball = matchDetails.ball ?? {}
  if (!ball.withPlayer || !ball.withTeam) return { coverIds: [], blockLanes: [] }

  const possessionTeam = getTeam(matchDetails, ball.withTeam)
  const defendingTeam = getOpposition(matchDetails, ball.withTeam)
  const carrier = activePlayers(possessionTeam).find(player => player.playerID === ball.Player)
  if (!carrier || !defendingTeam) return { coverIds: [], blockLanes: [] }

  const defendersByDistance = activePlayers(defendingTeam)
    .map(player => ({ player, distance: distance(player.currentPOS, carrier.currentPOS) }))
    .sort((a, b) => a.distance - b.distance)

  const presser = defendersByDistance[0]?.player
  const coverIds = defendersByDistance.slice(1, 3).map(item => String(item.player.playerID))
  const bestPass = tactical.passOptions?.[0]
  const receiver = bestPass ? activePlayers(possessionTeam).find(player => String(player.playerID) === bestPass.playerId) : undefined
  const blockLanes = receiver && presser ? [{
    defenderId: coverIds[0] ?? String(presser.playerID),
    fromPlayerId: String(carrier.playerID),
    toPlayerId: String(receiver.playerID),
    x: Number(((carrier.currentPOS[0] + receiver.currentPOS[0]) / 2).toFixed(3)),
    y: Number(((carrier.currentPOS[1] + receiver.currentPOS[1]) / 2).toFixed(3))
  }] : []

  return {
    presserId: presser ? String(presser.playerID) : undefined,
    coverIds,
    blockLanes
  }
}

module.exports = {
  assignPressing
}
