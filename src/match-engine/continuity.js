'use strict'

function ballPoint(ball = {}) {
  return {
    x: Number(ball.x ?? 0),
    y: Number(ball.y ?? 0),
    z: Number(ball.z ?? 0)
  }
}

function playerPositions(frame) {
  return new Map((frame.players ?? []).map(player => [player.id, player]))
}

function hasLargePlayerJump(previous, frame) {
  const previousPlayers = playerPositions(previous)
  return (frame.players ?? []).some(player => {
    const before = previousPlayers.get(player.id)
    if (!before) return false
    return Math.hypot(Number(player.x) - Number(before.x), Number(player.y) - Number(before.y)) > 35
  })
}

function isResetEvent(frame) {
  return (frame.events ?? []).some(event => event.type === 'set_piece' || event.type === 'goal' || /kick off|second half/i.test(event.message ?? ''))
}

function discontinuityFor(previous, frame) {
  if (!previous) return undefined
  const previousHalf = Number(previous.half)
  const currentHalf = Number(frame.half)
  if (Number.isFinite(previousHalf) && Number.isFinite(currentHalf) && currentHalf !== previousHalf) {
    return { type: 'half_time_reset', interpolate: false }
  }
  if (isResetEvent(frame) && hasLargePlayerJump(previous, frame)) {
    return { type: 'set_piece_reset', interpolate: false }
  }
  return undefined
}

function addFrameContinuity(frames) {
  return (frames ?? []).map((frame, index, allFrames) => {
    const previous = allFrames[index - 1]
    const next = allFrames[index + 1]
    return {
      ...frame,
      continuity: {
        ...(frame.continuity ?? {}),
        previousTick: previous?.tick,
        nextTick: next?.tick
      },
      discontinuity: discontinuityFor(previous, frame),
      ball: {
        ...frame.ball,
        trajectory: next ? {
          from: ballPoint(frame.ball),
          to: ballPoint(next.ball),
          reason: 'frame_delta'
        } : undefined
      }
    }
  })
}

module.exports = {
  addFrameContinuity
}
