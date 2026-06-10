'use strict'

function ballPoint(ball = {}) {
  return {
    x: Number(ball.x ?? 0),
    y: Number(ball.y ?? 0),
    z: Number(ball.z ?? 0)
  }
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
