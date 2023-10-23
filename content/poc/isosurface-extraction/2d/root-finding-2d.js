import CreateParamReader from './params.js'

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

function Lerp2D(c00, c10, c01, c11, tx, ty) {
  // interpolate on the X axis
  let x0 = c00 * (1.0 - tx) + c10 * tx; // Lerp1D(c00, c10, tx);
  let x1 = c01 * (1.0 - tx) + c11 * tx; // Lerp1D(c01, c11, tx);

  // interpolate on the Y axis
  return x0 * (1.0 - ty) + x1 * ty;    // Lerp1D(x0, x1, ty);
}

function LerpColor(start, end, t) {
  let r = Lerp(start[0], end[0], t)
  let g = Lerp(start[1], end[1], t)
  let b = Lerp(start[2], end[2], t)
  return [r, g, b]
}

function RootFinding2DBegin(rootEl) {
  const controlEl = rootEl.querySelector('.controls')
  const canvas = rootEl.querySelector('canvas')
  const ctx = canvas.getContext('2d')

  if (ctx.reset == undefined) {
    ctx.reset = () => {
      let old = canvas.width
      canvas.width = 0
      canvas.width = old
    }
  }

  const third = Math.floor(canvas.width / 3)
  const square = {
    x: third,
    y: third,//(canvas.height - third) / 2,
    w: third,
    h: third,
  }

  const state = {
    dirty: true,
    params: {},
    imageData: new ImageData(canvas.width, canvas.height),
  }

  const colorRange = [
    ParseColorFloat('#3388de'),
    ParseColorFloat('#fa6e79')
  ]

  const Param = CreateParamReader(state, controlEl)
  function ReadParams() {
    Param('c00', 'f32')
    Param('c10', 'f32')
    Param('c01', 'f32')
    Param('c11', 'f32')
  }

  function Clamp(v, lo, hi) {
    return Math.max(lo, Math.min(v, hi))
  }

  function RenderFrame() {
    ReadParams()
    if (!state.dirty) {
      requestAnimationFrame(RenderFrame)
      return
    }

    state.dirty = false
    // state.params.c00 = Math.sin(Date.now() * 0.001)
    requestAnimationFrame(RenderFrame)

    ctx.reset()

    // rebuild the background gradient
    {
      let w = canvas.width
      let h = canvas.height

      for (let y = 0; y < h; y++) {
        let ty = 1.0 - y/h
        let yoff = y * w * 4
        for (let x = 0; x < w; x++) {
          let tx = x/w

          let v = Lerp2D(
            state.params.c00,
            state.params.c10,
            state.params.c01,
            state.params.c11,
            tx,
            ty
          )

          let c = LerpColor(
            colorRange[0],
            colorRange[1],
            v * 0.5 + 0.5
          )

          if (Math.abs(v) < 0.005) {
            if (
              x > square.x && x < square.x + square.w &&
              y > square.y && y < square.y + square.h
            ) {
              c[0] = 0
              c[1] = 0
              c[2] = 0
            } else {
              c[0] *= 0.85
              c[1] *= 0.85
              c[2] *= 0.85
            }
          }
          state.imageData.data[yoff + x * 4 + 0] = c[0]
          state.imageData.data[yoff + x * 4 + 1] = c[1]
          state.imageData.data[yoff + x * 4 + 2] = c[2]
          state.imageData.data[yoff + x * 4 + 3] = 255
        }
      }
    }


    // draw the square
    {
      ctx.putImageData(state.imageData, 0, 0)
      ctx.strokeStyle = '#fff'
      ctx.strokeRect(square.x, square.y, square.w, square.h)
    }

    // draw the corner labels
    {
      ctx.fillStyle = '#fff'
      ctx.font = '16px Hack, monospace'

      // c00
      {
        let v = Lerp2D(
          state.params.c00,
          state.params.c10,
          state.params.c01,
          state.params.c11,
          square.x / canvas.width,
          square.y / canvas.height
        )


        let text = `c00 = ${v.toFixed(2)}`
        ctx.fillStyle = `#fff`
        ctx.fillText(
          text,
          square.x - ctx.measureText(text).width,
          square.y + square.h + 20.0
        )
      }

      // c10
      {

        let v = Lerp2D(
          state.params.c00,
          state.params.c10,
          state.params.c01,
          state.params.c11,
          (square.x + square.w) / canvas.width,
          square.y / canvas.height
        )

        let text = `c10 = ${v.toFixed(2)}`
        ctx.fillText(
          text,
          square.x + square.w,
          square.y + square.h + 20.0
        )
      }

      // c01
      {
        let v = Lerp2D(
          state.params.c00,
          state.params.c10,
          state.params.c01,
          state.params.c11,
          square.x / canvas.width,
          (square.y + square.h) / canvas.height
        )

        let text = `c01 = ${v.toFixed(2)}`
        ctx.fillText(
          text,
          square.x - ctx.measureText(text).width,
          square.y - 10.0
        )
      }

      // c11
      {
        let v = Lerp2D(
          state.params.c00,
          state.params.c10,
          state.params.c01,
          state.params.c11,
          (square.x + square.w) / canvas.width,
          (square.y + square.h) / canvas.height
        )

        let text = `c11 = ${state.params.c11.toFixed(2)}`
        ctx.fillText(
          text,
          square.x + square.w,
          square.y - 10.0
        )
      }
    }

  }

  requestAnimationFrame(RenderFrame)
}

RootFinding2DBegin(
  document.querySelector('#root-finding-2d-content')
)