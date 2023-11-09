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

function LerpColor(out, start, end, t) {
  out[0] = Lerp(start[0], end[0], t)
  out[1] = Lerp(start[1], end[1], t)
  out[2] = Lerp(start[2], end[2], t)
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

  const square = {
    x: 0.0,
    y: 0.0,
    w: canvas.width,
    h: canvas.height,
  }

  const state = {
    dirty: true,
    params: {},

    cornerTargets: {
      t: -1.0,
      c00: [0, 0],
      c10: [0, 0],
      c01: [0, 0],
      c11: [0, 0],
    },
    imageData: new ImageData(canvas.width, canvas.height),
  }

  const colorRange = [
    ParseColorFloat('#3388de'),
    ParseColorFloat('#fa6e79')
  ]

  const Param = CreateParamReader(state, controlEl)
  function ReadParams() {
    Param('debugAsymptoticDeciderBughunt', 'bool')

    if (state.cornerTargets.t == -1.0) {

      Param('c00', 'f32')
      Param('c10', 'f32')
      Param('c01', 'f32')
      Param('c11', 'f32')

      state.cornerTargets.t = 1.0
      state.cornerTargets.c00[0] = state.params.c00
      state.cornerTargets.c00[1] = state.params.c00

      state.cornerTargets.c10[0] = state.params.c10
      state.cornerTargets.c10[1] = state.params.c10

      state.cornerTargets.c01[0] = state.params.c01
      state.cornerTargets.c01[1] = state.params.c01

      state.cornerTargets.c11[0] = state.params.c11
      state.cornerTargets.c11[1] = state.params.c11
    }

    if (state.params.debugAsymptoticDeciderBughunt && !state.cornerTargets.bugFound) {
      if (state.cornerTargets.t >= 1.0) {
        state.cornerTargets.t = 0.0;

        state.cornerTargets.c00[0] = state.cornerTargets.c00[1]
        state.cornerTargets.c10[0] = state.cornerTargets.c10[1]
        state.cornerTargets.c01[0] = state.cornerTargets.c01[1]
        state.cornerTargets.c11[0] = state.cornerTargets.c11[1]

        state.cornerTargets.c00[1] = Math.random() * 2.0 - 1.0
        state.cornerTargets.c10[1] = Math.random() * 2.0 - 1.0
        state.cornerTargets.c01[1] = Math.random() * 2.0 - 1.0
        state.cornerTargets.c11[1] = Math.random() * 2.0 - 1.0

        // let decider = (Math.random() * 2.0 - 1.0) * 2.0
        // if (IsNegative(decider)) {
        //   state.cornerTargets.c00[1] = -state.cornerTargets.c00[1]
        //   state.cornerTargets.c11[1] = -state.cornerTargets.c11[1]
        // } else {
        //   state.cornerTargets.c10[1] = -state.cornerTargets.c10[1]
        //   state.cornerTargets.c01[1] = -state.cornerTargets.c00[1]
        // }
      } else {
        state.dirty = true;
        state.cornerTargets.t += 0.01

        controlEl.querySelector('.c00-control input').value = Lerp(
          state.cornerTargets.c00[0],
          state.cornerTargets.c00[1],
          state.cornerTargets.t
        )
        controlEl.querySelector('.c10-control input').value = Lerp(
          state.cornerTargets.c10[0],
          state.cornerTargets.c10[1],
          state.cornerTargets.t
        )
        controlEl.querySelector('.c01-control input').value = Lerp(
          state.cornerTargets.c01[0],
          state.cornerTargets.c01[1],
          state.cornerTargets.t
        )
        controlEl.querySelector('.c11-control input').value = Lerp(
          state.cornerTargets.c11[0],
          state.cornerTargets.c11[1],
          state.cornerTargets.t
        )
      }
    }

    Param('c00', 'f32')
    Param('c10', 'f32')
    Param('c01', 'f32')
    Param('c11', 'f32')
  }

  function Clamp(v, lo, hi) {
    return Math.max(lo, Math.min(v, hi))
  }

  // see: https://mastodon.gamedev.place/@sjb3d/110957635606866131
  const IsNegative = (function () {
    let isNegativeScratch = new DataView(new ArrayBuffer(8))
    return function IsNegative(value) {
      isNegativeScratch.setFloat64(0, value, true)
      let uints = isNegativeScratch.getUint32(4, true)
      return (uints & 1 << 31) != 0 ? 1 : 0
    }
  })();

  function ContainsCrossing(a, b) {
    return IsNegative(a) != IsNegative(b)
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
      let c = [0, 0, 0, 0]
      for (let y = 0; y < h; y++) {
        let yoff = y * w * 4
        for (let x = 0; x < w; x++) {

          let negativeCount = 0
          for (let ly = -1; ly <= 1; ly += 1) {
            let ty = 1.0 - (y + ly) / h
            for (let lx = -1; lx <= 1; lx += 1) {
              let tx = (x + lx)/w


              let v = Lerp2D(
                state.params.c00,
                state.params.c10,
                state.params.c01,
                state.params.c11,
                tx,
                ty
              )

              if (IsNegative(v)) {
                negativeCount++
              }
            }
          }

          let v = Lerp2D(
            state.params.c00,
            state.params.c10,
            state.params.c01,
            state.params.c11,
            x / w,
            1.0 - y / h
          )
          LerpColor(
            c,
            colorRange[0],
            colorRange[1],
            v * 0.5 + 0.5
          )

          if (negativeCount > 0 && negativeCount < 9) {
            if (
              x > square.x && x < square.x + square.w &&
              y > square.y && y < square.y + square.h
            ) {
              c[0] *= 0.8
              c[1] *= 0.8
              c[2] *= 0.8
            } else {
              c[0] *= 0.9
              c[1] *= 0.9
              c[2] *= 0.9
            }
          }

          if (!IsNegative(v)) {
            // if (
            //   x > square.x && x < square.x + square.w &&
            //   y > square.y && y < square.y + square.h
            // ) {
            c[0] += 60.0
            c[1] += 60.0
            c[2] += 60.0
            // }
          } else {
            c[0] -= 20.0
            c[1] -= 20.0
            c[2] -= 20.0
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


    let c00 = Lerp2D(
      state.params.c00,
      state.params.c10,
      state.params.c01,
      state.params.c11,
      square.x / canvas.width,
      square.y / canvas.height
    )

    let c10 = Lerp2D(
      state.params.c00,
      state.params.c10,
      state.params.c01,
      state.params.c11,
      (square.x + square.w) / canvas.width,
      square.y / canvas.height
    )

    let c01 = Lerp2D(
      state.params.c00,
      state.params.c10,
      state.params.c01,
      state.params.c11,
      square.x / canvas.width,
      (square.y + square.h) / canvas.height
    )

    let c11 = Lerp2D(
      state.params.c00,
      state.params.c10,
      state.params.c01,
      state.params.c11,
      (square.x + square.w) / canvas.width,
      (square.y + square.h) / canvas.height
    )

    // draw the corner labels
    {
      ctx.fillStyle = '#fff'
      ctx.font = '16px Hack, monospace'

      // c00
      {
        let text = `c00 = ${c00.toFixed(2)}`
        ctx.fillStyle = `#fff`
        ctx.fillText(
          text,
          square.x - ctx.measureText(text).width,
          square.y + square.h + 20.0
        )
      }

      // c10
      {
        let text = `c10 = ${c10.toFixed(2)}`
        ctx.fillText(
          text,
          square.x + square.w,
          square.y + square.h + 20.0
        )
      }

      // c01
      {


        let text = `c01 = ${c01.toFixed(2)}`
        ctx.fillText(
          text,
          square.x - ctx.measureText(text).width,
          square.y - 10.0
        )
      }

      // c11
      {
        let text = `c11 = ${c11.toFixed(2)}`
        ctx.fillText(
          text,
          square.x + square.w,
          square.y - 10.0
        )
      }
    }



    // draw the vertices
    let verts = [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]
    {

      if (ContainsCrossing(c00, c10)) {
        let t = c00 / (c00 - c10)
        verts[0][0] = square.x + square.w * t
        verts[0][1] = square.y + square.h

        ctx.beginPath()
        ctx.arc(verts[0][0], verts[0][1], 3, 0, Math.PI * 2.0)
        ctx.fill()
      }

      if (ContainsCrossing(c10, c11)) {
        let t = c11 / (c11 - c10)
        verts[1][0] = square.x + square.w
        verts[1][1] = square.y + square.h * t

        ctx.beginPath()
        ctx.arc(verts[1][0], verts[1][1], 3, 0, Math.PI * 2.0)
        ctx.fill()
      }

      if (ContainsCrossing(c01, c11)) {
        let t = c01 / (c01 - c11)
        verts[2][0] = square.x + square.w * t
        verts[2][1] = square.y

        ctx.beginPath()
        ctx.arc(verts[2][0], verts[2][1], 3, 0, Math.PI * 2.0)
        ctx.fill()
      }

      if (ContainsCrossing(c00, c01)) {
        let t = c01 / (c01 - c00)
        verts[3][0] = square.x
        verts[3][1] = square.y + square.h * t

        ctx.beginPath()
        ctx.arc(verts[3][0], verts[3][1], 3, 0, Math.PI * 2.0)
        ctx.fill()
      }
    }

    // connect the verts
    {
      function DrawSegment(a, b) {
        ctx.beginPath()
        ctx.moveTo(a[0], a[1])
        ctx.lineTo(b[0], b[1])
        ctx.stroke()
      }

      //    corners         edges
      //
      //    0     1           0
      //     +---+          +---+
      //     |   |        3 |   | 1
      //     +---+          +---+
      //    3     2           2
      //

      const edgeConnectionCounts = [
        0, 1, 1, 1, 1, 2, 1, 1, 1, 1, 2, 1, 1, 1, 1, 0
      ];

      // entry format: edgeStartIndex, endEndIndex, ...
      const edgeConnections = [
        [-1, -1, -1, -1, -1, -1, -1, -1],
        [0, 3, -1, -1, -1, -1, -1, -1],
        [1, 0, -1, -1, -1, -1, -1, -1],
        [1, 3, -1, -1, -1, -1, -1, -1],
        [2, 1, -1, -1, -1, -1, -1, -1],
        [0, 1, 2, 3, 0, 3, 2, 1],
        [2, 0, -1, -1, -1, -1, -1, -1],
        [2, 3, -1, -1, -1, -1, -1, -1],
        [3, 2, -1, -1, -1, -1, -1, -1],
        [0, 2, -1, -1, -1, -1, -1, -1],
        [1, 0, 3, 2, 1, 2, 3, 0],
        [1, 2, -1, -1, -1, -1, -1, -1],
        [3, 1, -1, -1, -1, -1, -1, -1],
        [0, 1, -1, -1, -1, -1, -1, -1],
        [3, 0, -1, -1, -1, -1, -1, -1],
        [-1, -1, -1, -1, -1, -1, -1, -1],
      ]

      let cellCode = (
        (IsNegative(c00) << 0) |
        (IsNegative(c10) << 1) |
        (IsNegative(c11) << 2) |
        (IsNegative(c01) << 3)
      )


      const segmentCount = edgeConnectionCounts[cellCode];

      if (segmentCount == 0) {
        return;
      }

      ctx.strokeStyle = "#fff"
      ctx.lineWidth = 2
      if (segmentCount == 1) {
        // Add a segment between the two edge indices
        DrawSegment(
          verts[edgeConnections[cellCode][0]],
          verts[edgeConnections[cellCode][1]]
        )
        return;
      }


      // let centerValue = Lerp2D(
      //   state.params.c00,
      //   state.params.c10,
      //   state.params.c01,
      //   state.params.c11,
      //   0.5,
      //   0.5
      // )

      let centerValue = c10 * c01 - c00 * c11

      // Asymptote Intersection or SDF Sampling
      // const f32 centerValue = GetCellCenterValue();
      if (IsNegative(centerValue)) {
        DrawSegment(
          verts[edgeConnections[cellCode][0]],
          verts[edgeConnections[cellCode][1]]
        );
        DrawSegment(
          verts[edgeConnections[cellCode][2]],
          verts[edgeConnections[cellCode][3]]
        );
      } else {
        DrawSegment(
          verts[edgeConnections[cellCode][4]],
          verts[edgeConnections[cellCode][5]]
        );
        DrawSegment(
          verts[edgeConnections[cellCode][6]],
          verts[edgeConnections[cellCode][7]]
        );
      }

      // draw the asymptotes
      {
        ctx.fillStyle = "#5ab552"
        ctx.strokeStyle = "#5ab552"
        let den = (c00 + c11 - c01 - c10)
        let s = (c00 - c01) / den
        let t = 1.0 - (c00 - c10) / den
        ctx.beginPath()

        ctx.moveTo(s * canvas.width, 0)
        ctx.lineTo(s * canvas.width, canvas.height)

        ctx.moveTo(0, t * canvas.height)
        ctx.lineTo(canvas.width, t * canvas.height)

        ctx.stroke()

        ctx.beginPath()

        ctx.arc(s * canvas.width, t * canvas.height, 10, 0, Math.PI * 2.0)
        ctx.fill()
      }


    }
  }

  requestAnimationFrame(RenderFrame)
}

RootFinding2DBegin(
  document.querySelector('#root-finding-2d-content')
)