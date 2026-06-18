const common = require(`../lib/common`)

function resetPlayerPositions(matchDetails) {
  for (let player of matchDetails.kickOffTeam.players) {
    if (player.currentPOS[0] != 'NP') {
      player.currentPOS = player.originPOS.map(x => x)
      player.intentPOS = player.originPOS.map(x => x)
    }
  }
  for (let player of matchDetails.secondTeam.players) {
    if (player.currentPOS[0] != 'NP') {
      player.currentPOS = player.originPOS.map(x => x)
      player.intentPOS = player.originPOS.map(x => x)
    }
  }
}

function setGameVariables(team) {
  team.teamID = common.getRandomNumber(1000000000000, 99999999999999999)
  team.players.forEach(player => {
    player.teamID = team.teamID
    player.playerID = common.getRandomNumber(1000000000000, 99999999999999999)
    player.originPOS = player.currentPOS.slice()
    player.intentPOS = player.currentPOS.slice()
    player.action = `none`
    player.offside = false
    player.hasBall = false
    player.stats = {
      'goals': 0,
      'shots': {
        'total': 0,
        'on': 0,
        'off': 0
      },
      'cards': {
        'yellow': 0,
        'red': 0
      },
      'passes': {
        'total': 0,
        'on': 0,
        'off': 0
      },
      'tackles': {
        'total': 0,
        'on': 0,
        'off': 0,
        'fouls': 0
      }
    }
    if (player.position == 'GK') player.stats.saves = 0
  })
  team.intent = `none`
  return team
}

function koDecider(team1, matchDetails) {
  const playerWithBall = common.getRandomNumber(9, 10)
  const kickoffPosition = matchDetails.ball.position.slice(0, 2)
  matchDetails.ball.withPlayer = true
  matchDetails.ball.Player = team1.players[playerWithBall].playerID
  matchDetails.ball.withTeam = team1.teamID
  team1.intent = `attack`
  team1.players[playerWithBall].currentPOS = kickoffPosition.map(x => x)
  team1.players[playerWithBall].intentPOS = kickoffPosition.map(x => x)
  team1.players[playerWithBall].hasBall = true
  matchDetails.ball.lastTouch.playerName = team1.players[playerWithBall].name
  matchDetails.ball.lastTouch.playerID = team1.players[playerWithBall].playerID
  matchDetails.ball.lastTouch.teamID = team1.teamID
  matchDetails.ball.lastTouch.deflection = false
  matchDetails.ball.ballOverIterations = []
  let waitingPlayer = playerWithBall == 9 ? 10 : 9
  team1.players[waitingPlayer].currentPOS = [kickoffPosition[0] + 20, kickoffPosition[1]]
  team1.players[waitingPlayer].intentPOS = [kickoffPosition[0] + 20, kickoffPosition[1]]
  return team1
}

function populateMatchDetails(team1, team2, pitchDetails) {
  return {
    matchID: common.getRandomNumber(1000000000000, 99999999999999999),
    kickOffTeam: team1,
    secondTeam: team2,
    pitchSize: [pitchDetails.pitchWidth, pitchDetails.pitchHeight, pitchDetails.goalWidth],
    ball: {
      position: [pitchDetails.pitchWidth / 2, pitchDetails.pitchHeight / 2, 0],
      withPlayer: true,
      Player: ``,
      withTeam: ``,
      direction: `south`,
      ballOverIterations: [],
      lastTouch: {
        playerName: ``,
        playerID: ``,
        teamID: ``,
        bodyPart: ``
      }
    },
    half: 1,
    kickOffTeamStatistics: {
      goals: 0,
      shots: {
        'total': 0,
        'on': 0,
        'off': 0
      },
      corners: 0,
      freekicks: 0,
      penalties: 0,
      fouls: 0
    },
    secondTeamStatistics: {
      goals: 0,
      shots: {
        'total': 0,
        'on': 0,
        'off': 0
      },
      corners: 0,
      freekicks: 0,
      penalties: 0,
      fouls: 0
    },
    iterationLog: []
  }
}

module.exports = {
  resetPlayerPositions,
  setGameVariables,
  koDecider,
  populateMatchDetails
}
