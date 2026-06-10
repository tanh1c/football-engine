'use strict'

const SET_PIECE_TERMS = ['corner', 'throw', 'free kick', 'freekick', 'penalty', 'goal kick']

function teamAttacksTowardBottom(matchDetails, teamId) {
  return teamId === matchDetails.kickOffTeam?.teamID
}

function classifyPhase(matchDetails) {
  const logText = (matchDetails.iterationLog ?? []).join(' ').toLowerCase()
  if (SET_PIECE_TERMS.some(term => logText.includes(term))) return 'set_piece'

  const ball = matchDetails.ball ?? {}
  if (!ball.withPlayer || !ball.withTeam) return 'transition'

  const [, pitchHeight] = matchDetails.pitchSize ?? [100, 100]
  const y = Number(ball.position?.[1] ?? pitchHeight / 2)
  const attackingBottom = teamAttacksTowardBottom(matchDetails, ball.withTeam)
  const progress = attackingBottom ? y / pitchHeight : 1 - (y / pitchHeight)

  if (progress < 0.33) return 'build_up'
  if (progress > 0.67) return 'final_third'
  return 'midfield'
}

module.exports = {
  classifyPhase
}
