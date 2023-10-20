let rootEl = document.getElementById('LinearInterpolation2D-content')
let canvas = rootEl.querySelector('canvas')
let ctx = canvas.getContext('2d')
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

function Lerp(a, b, t) {
  return a * (1.0 - t) + b * t
}

function LerpColor(start, end, t) {
  let r = Lerp(start[0], end[0], t)
  let g = Lerp(start[1], end[1], t)
  let b = Lerp(start[2], end[2], t)
  return [r, g, b]
}
function LerpColorBilinear(c00, c10, c01, c11, tx, ty) {
  let x1 = LerpColor(c00, c10, tx)
  let x2 = LerpColor(c01, c11, tx)
  return LerpColor(x1, x2, ty)
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

const values = {
  c00: 0.0,
  c10: 1.0,
  c01: 2.0,
  c11: 3.0,

  tx: 0.0,
  ty: 0.0,
  v: 0.0,
}

const colors = {
  c00: '#666666',
  c10: '#FF6666',
  c01: '#66FF66',
  c11: '#FFFF66',
}

const colorFloats = {}
for (let [key, value] of Object.entries(colors)) {
  colorFloats[key] = ParseColorFloat(value)
}
let bitmap = null
let padding = [Math.floor(1024 / 3), 128]
let width = 256
{
  let id = new ImageData(width, width)
  for (let y = 0; y < width; y++) {
    let ty = 1.0 - y / width;
    let yoff = y * width * 4
    for (let x = 0; x < width; x++) {
      let tx = x / width

      let c = LerpColorBilinear(
        colorFloats.c00,
        colorFloats.c10,
        colorFloats.c01,
        colorFloats.c11,
        tx,
        ty
      )
      id.data[yoff + x * 4 + 0] = c[0]
      id.data[yoff + x * 4 + 1] = c[1]
      id.data[yoff + x * 4 + 2] = c[2]
      id.data[yoff + x * 4 + 3] = 255
    }
  }

  bitmap = await createImageBitmap(id)
}

function Clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

function Lerp2D(c00, c10, c01, c11, tx, ty) {
  // interpolate on the X axis
  let x0 = c00 * (1.0 - tx) + c10 * tx; // Lerp1D(c00, c10, tx);
  let x1 = c01 * (1.0 - tx) + c11 * tx; // Lerp1D(c01, c11, tx);

  // interpolate on the Y axis
  return x0 * (1.0 - ty) + x1 * ty;    // Lerp1D(x0, x1, ty);
}

function RenderFrame() {
  if (!state.dirty) {
    requestAnimationFrame(RenderFrame)
    return
  }

  state.dirty = false

  ctx.reset()
  ctx.drawImage(bitmap, padding[0], padding[1])

  // update tx
  {
    let ratio = (state.mouse.pos[0] - padding[0]) / (width)
    ratio = Math.max(0.0, Math.min(1.0, ratio))
    let localT = Math.round(ratio * 100.0) / 100.0
    values.tx = localT
  }

  // update ty
  {
    let ratio = (state.mouse.pos[1] - padding[1]) / (width)
    ratio = Math.max(0.0, Math.min(1.0, ratio))
    let localT = 1.0 - Math.round(ratio * 100.0) / 100.0
    values.ty = localT
  }

  values.v = Lerp2D(
    values.c00,
    values.c10,
    values.c01,
    values.c11,
    values.tx,
    values.ty
  )

  ctx.font = "16px Hack, monospace"
  ctx.fillStyle = colors.c00;
  let c00Text = `c00 = ${values.c00.toFixed(2)}`
  let c00TextWidth = ctx.measureText(c00Text).width
  ctx.fillText(c00Text, padding[0] - c00TextWidth * 0.5, padding[1] + width + 30)

  ctx.fillStyle = colors.c10;
  let c10Text = `c10 = ${values.c10.toFixed(2)}`
  let c10TextWidth = ctx.measureText(c10Text).width
  ctx.fillText(c10Text, padding[0] - c10TextWidth * 0.5 + width, padding[1] + width + 30)

  ctx.fillStyle = colors.c01;
  let c01Text = `c01 = ${values.c01.toFixed(2)}`
  let c01TextWidth = ctx.measureText(c01Text).width
  ctx.fillText(c01Text, padding[0] - c01TextWidth * 0.5, padding[1] - 20)

  ctx.fillStyle = colors.c11;
  let c11Text = `c11 = ${values.c11.toFixed(2)}`
  let c11TextWidth = ctx.measureText(c11Text).width
  ctx.fillText(c11Text, padding[0] - c11TextWidth * 0.5 + width, padding[1] - 20)


  let cx = Clamp(state.mouse.pos[0], padding[0], padding[0] + width)
  let cy = Clamp(state.mouse.pos[1], padding[1], padding[1] + width)

  {
    ctx.save()
    let radius = 5
    ctx.strokeStyle = "white"
    ctx.lineWidth = 2
    ctx.beginPath()

    ctx.moveTo(cx + radius, cy)
    ctx.arc(cx, cy, radius, 0, Math.PI * 2.0)
    ctx.stroke()

    ctx.strokeStyle = '#fff'
    ctx.moveTo(cx, cy)
    ctx.lineTo(padding[0] + width, padding[1] + width * 0.5)
    ctx.lineTo(padding[0] + width + 20, padding[1] + width * 0.5)
    ctx.stroke()
    ctx.restore()

    let c = LerpColorBilinear(
      colorFloats.c00,
      colorFloats.c10,
      colorFloats.c01,
      colorFloats.c11,
      values.tx,
      values.ty
    )

    let vText = `v(${values.v.toFixed(2)})`
    let tText = `t(${values.tx.toFixed(2)}, ${values.ty.toFixed(2)})`

    ctx.fillStyle = `rgb(${c[0]}, ${c[1]}, ${c[2]})`
    ctx.fillText(
      vText,
      padding[0] + width + 30,
      padding[1] + width * 0.5 + 10
    )

    ctx.fillStyle = '#fff'
    ctx.fillText(
      tText,
      padding[0] + width + 30,
      padding[1] + width * 0.5 - 10
    )
  }
  requestAnimationFrame(RenderFrame)
}

requestAnimationFrame(RenderFrame)
