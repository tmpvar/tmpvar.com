let rootEl = document.getElementById('LinearInterpolation1D-content')
let canvas = rootEl.querySelector('canvas')
let ctx = canvas.getContext('2d')
if (ctx.reset == undefined) {
  ctx.reset = () => {
    let old = canvas.width
    canvas.width = 0
    canvas.width = old
  }
}

const vars = {}

function ParseColorFloat(value) {
  if (value.startsWith('#')) {
    let v = parseInt(value.replace("#", ""), 16)

    let r = (v >> 16) & 0xFF
    let g = (v >> 8) & 0xFF
    let b = (v >> 0) & 0xFF
    return [r, g, b]
  } else if (value.startsWith('rgb(')) {
    value = value.replace('rgb(', '')
    value = value.replace(')', '')
    return value.split(',').map(v => parseFloat(v.trim()))
  }
}

const state = {
  dirty: true,
  mouse: {
    pos: [0, 0],
    downPos: [0, 0],
    lastPos: [0, 0],
    down: false
  },
  inDemo: true,
  paddingWidth: 8,
}

state.demo = {
  start: Math.random(),
  end: Math.random(),
  t: 0.0,
}

const MoveMouse = (x, y) => {
  let ratioX = canvas.width / canvas.clientWidth
  let ratioY = canvas.height / canvas.clientHeight
  state.mouse.lastPos[0] = state.mouse.pos[0]
  state.mouse.lastPos[1] = state.mouse.pos[1]

  state.mouse.pos[0] = x * ratioX
  state.mouse.pos[1] = y * ratioY
  state.dirty = true;
}

canvas.addEventListener("mousemove", e => {
  MoveMouse(e.offsetX, e.offsetY)

  let dx = state.mouse.pos[0] - state.mouse.lastPos[0]
  let dy = state.mouse.pos[1] - state.mouse.lastPos[1]

  state.inDemo = false
  if (Math.abs(dx) < 1.0 && Math.abs(dy) < 1.0) {
    return;
  }
  state.dirty = true
})

state.mouse.pos[0] = 100.0;

const values = {
  start: -10.0,
  end: 50.0,
  t: 0.0,
  v: 0.0,
}

const colors = {
  start: '#666666',
  end: '#FF6666',
  t: '#fff',
}

function Lerp(a, b, t) {
  return a * (1.0 - t) + b * t
}

function LerpColor(start, end, t) {
  let r = Lerp(start[0], end[0], t).toFixed(3)
  let g = Lerp(start[1], end[1], t).toFixed(3)
  let b = Lerp(start[2], end[2], t).toFixed(3)
  return `rgb(${r}, ${g}, ${b})`
}

function RenderFrame() {
  if (!state.dirty) {
    requestAnimationFrame(RenderFrame)
    return
  }

  if (!state.inDemo) {
    state.dirty = false
    let width = canvas.width - state.paddingWidth * 2.0;
    let ratio = (state.mouse.pos[0] - state.paddingWidth) / (width)
    ratio = Math.max(0.0, Math.min(1.0, ratio))
    let localT = Math.round(ratio * 100.0) / 100.0
    values.t = localT
  } else {
    let localT = Math.sin(state.demo.t) * Math.cos(state.demo.t * 0.1)
    localT = Math.max(-1.0, Math.min(1.0, localT))
    values.t = localT * 0.5 + 0.5
    state.demo.t += 0.01;
  }

  let vColor = LerpColor(
    ParseColorFloat(colors.start),
    ParseColorFloat(colors.end),
    values.t
  )

  values.v = values.start * (1.0 - values.t) + values.end * values.t

  ctx.reset();
  ctx.translate(state.paddingWidth, 0)
  let width = canvas.width - state.paddingWidth * 2.0;
  let gradient = ctx.createLinearGradient(0, 0, width, canvas.height)

  gradient.addColorStop(0.0, colors.start)
  gradient.addColorStop(1.0, colors.end)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 64, width, canvas.height - 96)

  // draw the x
  {
    let x = Math.floor(width * values.t)

    ctx.lineWidth = 2.0
    ctx.strokeStyle = '#fff'
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.moveTo(x, 96)
    ctx.lineTo(x, 64)
    ctx.stroke()
    let sideLength = 8
    let sideRadius = sideLength / 2.0;
    ctx.moveTo(x + 1, 65)
    ctx.lineTo(x + sideRadius, 66 - sideLength)
    ctx.lineTo(x - sideRadius, 66 - sideLength)
    ctx.lineTo(x - 1, 65)

    ctx.moveTo(x + 1, 95)
    ctx.lineTo(x + sideRadius, 94 + sideLength)
    ctx.lineTo(x - sideRadius, 94 + sideLength)
    ctx.lineTo(x - 1, 95)
    ctx.fill()

    ctx.font = "18px Hack,monospace"

    let tText = `t(${values.t.toFixed(3)})`
    let vText = `v(${values.v.toFixed(3)})`

    let textWidth = Math.max(
      ctx.measureText(tText).width,
      ctx.measureText(vText).width
    )

    let textStart = x - textWidth / 2.0
    let textEnd = x + textWidth / 2.0

    if (textStart < 0.0) {
      textStart = 0.0
      textEnd = textWidth
    }

    if (textEnd >= width) {
      textEnd = width
      textStart = textEnd - textWidth
    }

    textStart = Math.floor(textStart)
    textEnd = Math.floor(textEnd)

    ctx.fillStyle = colors.t
    ctx.fillText(tText, textStart, 20)

    ctx.fillStyle = vColor
    ctx.fillText(vText, textStart, 48)

    ctx.fillStyle = colors.start
    ctx.fillText(`start(${values.start})`, 0, 96 + 14 + 12)

    let endText = `end(${values.end})`
    ctx.fillStyle = colors.end
    ctx.fillText(endText, width - ctx.measureText(endText).width, 96 + 14 + 12)
  }
  requestAnimationFrame(RenderFrame)
}

requestAnimationFrame(RenderFrame)
