import { framePairAtPlayhead, interpolateFrame, playbackSpeedLabel, playheadDelta } from './interpolate.js'

export function createMatchViewer(canvas, options = {}) {
  const context = canvas.getContext('2d')
  const state = {
    frames: [],
    frameIndex: 0,
    playhead: 0,
    playing: false,
    lastTime: 0,
    speed: options.speed ?? 1,
    renderFps: options.renderFps ?? 60,
    rafId: undefined
  }

  function setFrames(frames) {
    state.frames = frames ?? []
    state.frameIndex = 0
    state.playhead = 0
    draw()
  }

  function resize() {
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.max(1, Math.floor(rect.width * window.devicePixelRatio))
    canvas.height = Math.max(1, Math.floor(rect.height * window.devicePixelRatio))
    context.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0)
    draw()
  }

  function pitchRect() {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const margin = 24
    const usableWidth = width - margin * 2
    const usableHeight = height - margin * 2
    const pitchRatio = 680 / 1050
    let pitchWidth = usableWidth
    let pitchHeight = pitchWidth / pitchRatio

    if (pitchHeight > usableHeight) {
      pitchHeight = usableHeight
      pitchWidth = pitchHeight * pitchRatio
    }

    return {
      x: (width - pitchWidth) / 2,
      y: (height - pitchHeight) / 2,
      width: pitchWidth,
      height: pitchHeight
    }
  }

  function mapPoint(frame, x, y) {
    const rect = pitchRect()
    return {
      x: rect.x + (x / frame.pitch.width) * rect.width,
      y: rect.y + (y / frame.pitch.height) * rect.height
    }
  }

  function drawPitch() {
    const rect = pitchRect()
    context.fillStyle = '#176b35'
    context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)

    context.fillStyle = '#238a45'
    context.fillRect(rect.x, rect.y, rect.width, rect.height)

    context.strokeStyle = 'rgba(255,255,255,0.9)'
    context.lineWidth = 2
    context.strokeRect(rect.x, rect.y, rect.width, rect.height)

    context.beginPath()
    context.moveTo(rect.x, rect.y + rect.height / 2)
    context.lineTo(rect.x + rect.width, rect.y + rect.height / 2)
    context.stroke()

    context.beginPath()
    context.arc(rect.x + rect.width / 2, rect.y + rect.height / 2, Math.min(rect.width, rect.height) * 0.11, 0, Math.PI * 2)
    context.stroke()

    const boxWidth = rect.width * 0.48
    const boxHeight = rect.height * 0.16
    context.strokeRect(rect.x + (rect.width - boxWidth) / 2, rect.y, boxWidth, boxHeight)
    context.strokeRect(rect.x + (rect.width - boxWidth) / 2, rect.y + rect.height - boxHeight, boxWidth, boxHeight)
  }

  function drawPlayers(frame) {
    for (const player of frame.players) {
      const point = mapPoint(frame, player.x, player.y)
      const fill = player.side === 'kickOffTeam' ? '#e74c3c' : '#3498db'
      context.beginPath()
      context.fillStyle = player.hasBall ? '#f1c40f' : fill
      context.strokeStyle = player.status === 'injured' ? '#8e44ad' : '#0b1721'
      context.lineWidth = player.hasBall ? 3 : 1.5
      context.arc(point.x, point.y, player.hasBall ? 7 : 6, 0, Math.PI * 2)
      context.fill()
      context.stroke()

      context.fillStyle = '#ffffff'
      context.font = '10px system-ui, sans-serif'
      context.textAlign = 'center'
      context.fillText(player.role ?? '', point.x, point.y - 10)
    }
  }

  function drawBall(frame) {
    const point = mapPoint(frame, frame.ball.x, frame.ball.y)
    const radius = 4 + Math.min(8, Math.max(0, frame.ball.z ?? 0) / 20)
    context.beginPath()
    context.fillStyle = '#ffffff'
    context.strokeStyle = '#111111'
    context.lineWidth = 1.5
    context.arc(point.x, point.y, radius, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  }

  function drawHud(frame) {
    context.fillStyle = 'rgba(0,0,0,0.65)'
    context.fillRect(16, 16, 260, 68)
    context.fillStyle = '#ffffff'
    context.font = '14px system-ui, sans-serif'
    context.textAlign = 'left'
    const displaySecond = Math.floor(frame.second)
    context.fillText(`Tick ${Math.floor(frame.tick)} • ${String(frame.minute).padStart(2, '0')}:${String(displaySecond).padStart(2, '0')}`, 28, 42)
    context.fillText(`Events: ${frame.events.length} • Speed ${playbackSpeedLabel(state.speed)}`, 28, 66)
  }

  function drawCommentary(frame) {
    const messages = frame.events.slice(-4).map(event => event.message)
    const x = canvas.clientWidth - 340
    const y = 16
    context.fillStyle = 'rgba(0,0,0,0.65)'
    context.fillRect(x, y, 324, 112)
    context.fillStyle = '#ffffff'
    context.font = '12px system-ui, sans-serif'
    context.textAlign = 'left'
    messages.forEach((message, index) => {
      context.fillText(message.slice(0, 48), x + 12, y + 24 + index * 22)
    })
  }

  function renderFrame() {
    const pair = framePairAtPlayhead(state.frames, state.playhead)
    state.frameIndex = pair.baseIndex
    return interpolateFrame(pair.current, pair.next, pair.ratio)
  }

  function draw() {
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    drawPitch()
    const frame = renderFrame()
    if (!frame) return
    drawPlayers(frame)
    drawBall(frame)
    drawHud(frame)
    drawCommentary(frame)
  }

  function loop(timestamp) {
    if (!state.playing) return
    if (!state.lastTime) state.lastTime = timestamp
    const elapsedSeconds = (timestamp - state.lastTime) / 1000
    state.lastTime = timestamp
    state.playhead += playheadDelta(state.speed, elapsedSeconds)
    if (state.playhead >= Math.max(0, state.frames.length - 1)) state.playhead = 0
    draw()
    state.rafId = requestAnimationFrame(loop)
  }

  function play() {
    if (state.playing) return
    state.playing = true
    state.lastTime = 0
    state.rafId = requestAnimationFrame(loop)
  }

  function pause() {
    state.playing = false
    if (state.rafId) cancelAnimationFrame(state.rafId)
  }

  function next() {
    state.playhead = Math.min(state.frames.length - 1, Math.floor(state.playhead) + 1)
    state.frameIndex = Math.floor(state.playhead)
    draw()
  }

  function previous() {
    state.playhead = Math.max(0, Math.floor(state.playhead) - 1)
    state.frameIndex = Math.floor(state.playhead)
    draw()
  }

  function setSpeed(speed) {
    state.speed = Math.max(0.25, Math.min(8, Number(speed) || 1))
  }

  window.addEventListener('resize', resize)
  resize()

  return { draw, next, pause, play, previous, resize, setFrames, setSpeed, state }
}
