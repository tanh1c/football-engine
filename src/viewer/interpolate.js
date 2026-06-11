function clampRatio(value) {
  return Math.max(0, Math.min(1, Number(value) || 0))
}

function lerp(a, b, ratio) {
  return Number(a ?? 0) + (Number(b ?? a ?? 0) - Number(a ?? 0)) * ratio
}

function playerMap(frame) {
  return new Map((frame?.players ?? []).map(player => [player.id, player]))
}

function interpolatePlayers(current, next, ratio) {
  const nextPlayers = playerMap(next)
  return (current.players ?? []).map(player => {
    const nextPlayer = nextPlayers.get(player.id)
    if (!nextPlayer) return { ...player }
    return {
      ...player,
      x: lerp(player.x, nextPlayer.x, ratio),
      y: lerp(player.y, nextPlayer.y, ratio),
      hasBall: ratio < 0.5 ? player.hasBall : nextPlayer.hasBall
    }
  })
}

function distance(a, b) {
  return Math.hypot(Number(b?.x ?? 0) - Number(a?.x ?? 0), Number(b?.y ?? 0) - Number(a?.y ?? 0))
}

function arcHeight(currentBall, nextBall, ratio) {
  const delta = distance(currentBall, nextBall)
  if (delta < 30) return 0
  return Math.sin(Math.PI * ratio) * Math.min(18, delta * 0.25)
}

function interpolateBall(current, next, ratio, players) {
  const nextBall = next?.ball ?? current.ball
  const ownerPlayerId = ratio < 0.5 ? current.ball?.ownerPlayerId : nextBall?.ownerPlayerId
  const ownerTeamId = ratio < 0.5 ? current.ball?.ownerTeamId : nextBall?.ownerTeamId
  const receiver = ownerPlayerId ? players.find(player => player.id === ownerPlayerId) : undefined
  if (receiver) {
    return {
      ...current.ball,
      x: receiver.x,
      y: receiver.y,
      z: 0,
      ownerPlayerId,
      ownerTeamId
    }
  }

  return {
    ...current.ball,
    x: lerp(current.ball?.x, nextBall?.x, ratio),
    y: lerp(current.ball?.y, nextBall?.y, ratio),
    z: lerp(current.ball?.z, nextBall?.z, ratio) + arcHeight(current.ball, nextBall, ratio),
    ownerPlayerId,
    ownerTeamId
  }
}

const BASE_MATCH_SECONDS_PER_REAL_SECOND = 10

function frameSeconds(frame) {
  return Number(frame?.minute ?? 0) * 60 + Number(frame?.second ?? 0)
}

export function playheadDelta(speed, elapsedSeconds) {
  return (Number(speed) || 1) * BASE_MATCH_SECONDS_PER_REAL_SECOND * (Number(elapsedSeconds) || 0)
}

export function playbackSpeedLabel(speed) {
  return `${(Number(speed) || 1) * BASE_MATCH_SECONDS_PER_REAL_SECOND}x`
}

export function interpolateFrame(current, next, ratio) {
  if (!current) return undefined
  if (next?.discontinuity?.interpolate === false) return next
  const boundedRatio = clampRatio(ratio)
  if (!next) return { ...current, players: [...(current.players ?? [])], ball: { ...(current.ball ?? {}) } }
  const totalSeconds = lerp(frameSeconds(current), frameSeconds(next), boundedRatio)

  return {
    ...current,
    tick: lerp(current.tick, next.tick, boundedRatio),
    minute: Math.floor(totalSeconds / 60),
    second: totalSeconds % 60,
    players: interpolatePlayers(current, next, boundedRatio),
    ball: interpolateBall(current, next, boundedRatio, interpolatePlayers(current, next, boundedRatio)),
    events: boundedRatio < 0.5 ? current.events : next.events
  }
}

export function framePairAtPlayhead(frames, playhead) {
  const safeFrames = frames ?? []
  const baseIndex = Math.max(0, Math.min(safeFrames.length - 1, Math.floor(playhead)))
  return {
    current: safeFrames[baseIndex],
    next: safeFrames[baseIndex + 1],
    ratio: clampRatio(playhead - baseIndex),
    baseIndex
  }
}
