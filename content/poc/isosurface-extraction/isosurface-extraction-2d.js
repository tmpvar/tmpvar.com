import CreateParamReader from './params.js'
import CreateCamera from './camera.js'

async function IsosurfaceExtraction2DBegin() {
  const TAU = Math.PI * 2.0

  const rootEl = document.getElementById('isosurface-extraction-2d-content')
  const controlEl = rootEl.querySelector('.controls')

  const canvas = rootEl.querySelector('canvas')
  const ctx = canvas.getContext('2d')
  const imageData = new ImageData(canvas.width, canvas.height)

  const state = {
    params: {},
    dirty: true,
  }

  // create a temporary canvas
  {
    let tmp = document.createElement('canvas')
    tmp.width = canvas.width;
    tmp.height = canvas.height
    state.bitmap = tmp.getContext('2d')
  }

  state.camera = CreateCamera(ctx, canvas)

  const Param = CreateParamReader(state, controlEl)
  function ReadParams() {
    Param('cellDiameter', 'i32', (parentEl, value, oldValue) => {
      let newValue = Math.pow(2, value)
      parentEl.querySelector('output').innerHTML = `2<sup>${value}</sup> = ${newValue}`
      return newValue
    })

    Param('epsilon', 'f32', (parentEl, value, oldValue) => {
      parentEl.querySelector('output').innerHTML = `${value}`
      return value
    })

    Param('isolevel', 'f32', (parentEl, value, oldValue) => {
      parentEl.querySelector('output').innerHTML = `${value}`
      return value
    })

    Param('subdivideWhileCollectingLoopsMaxSubdivisions', 'i32', (parentEl, value, oldValue) => {
      parentEl.querySelector('output').innerHTML = `${value}`
      return value
    })

    Param('subdivideWhileCollectingLoops', 'bool', (parentEl, value, oldValue) => {
      controlEl.querySelector('.subdivideWhileCollectingLoopsMaxSubdivisions-control input').disabled = !value
      controlEl.querySelector('.subdivideWhileCollectingLoopsUseSegmentBisector-control input').disabled = !value
      return value
    })
    Param('subdivideWhileCollectingLoopsUseSegmentBisector', 'bool')
    Param('subdivideWhileCollectingLoopsUseBestCagePoint', 'bool')
  }

  function SDFSphere(px, py, cx, cy, r) {
    let dx = px - cx
    let dy = py - cy
    return Math.sqrt(dx * dx + dy * dy) - r
  }

  function SDFBox(px, py, bx, by) {
    let dx = Math.abs(px) - bx;
    let dy = Math.abs(py) - by;

    let l = Math.sqrt(
      Math.pow(Math.max(dx, 0.0), 2) +
      Math.pow(Math.max(dy, 0.0), 2)
    )
    return l + Math.min(Math.max(dx, dy), 0.0);
  }


  function SampleSDF(x, y) {
    let d = 1000.0;

    // spheres
    {
      d = SDFSphere(
        x,
        y,
        canvas.width / 2 + 16.123,
        canvas.height / 2,
        256
      )

      d = Math.min(d, SDFSphere(
        x,
        y,
        256,
        256,
        128
      ))

      d = Math.min(d, SDFSphere(
        x,
        y,
        256,
        768,
        64
      ))
      d = Math.min(d, SDFSphere(
        x,
        y,
        840,
        768,
        32
      ))

      d = Math.min(d, SDFSphere(
        x,
        y,
        700,
        708,
        32
      ))

      d = Math.max(d, -SDFSphere(
        x,
        y,
        720,
        512,
        70
      ))
    }

    let rx = canvas.width / 2
    let ry = canvas.height / 2

    d -= state.params.isolevel
    // clamp the sdf into the box
    d = Math.max(d, SDFBox(rx - x, ry - y, rx - 10, ry - 10))
    // d = Math.min(d, SDFBox(rx - x, ry - y, rx, ry))

    return d
  }

  function SDFNormal(out, x, y) {
    let h = 0.0001;

    let s0 = SampleSDF(x - h, y - h)
    let s1 = SampleSDF(x + h, y - h)
    let s2 = SampleSDF(x - h, y + h)
    let s3 = SampleSDF(x + h, y + h)

    let nx = -s0 + s1 - s2 + s3
    let ny = -s0 - s1 + s2 + s3

    let l = Math.sqrt(nx * nx + ny * ny)
    out[0] = nx / l
    out[1] = ny / l
  }

  function Sign(d) {
    return d <= 0 ? -1 : 1
  }

  function LineSearch(out, sx, sy, sd, ex, ey, ed, epsilon, remainingSteps) {
    if (Math.abs(sd) <= epsilon) {
      out[0] = sx
      out[1] = sy
      return true
    }

    if (Math.abs(ed) <= epsilon) {
      out[0] = ex
      out[1] = ey
      return true
    }

    let mx = (sx + ex) * 0.5
    let my = (sy + ey) * 0.5

    let md = SampleSDF(mx, my);
    if (Math.abs(md) <= epsilon) {
      out[0] = mx
      out[1] = my
      return true
    }

    if (remainingSteps < 0) {
      return false
    }

    if ((sd < 0.0 && md >= 0) || (sd >= 0.0 && md < 0.0)) {
      return LineSearch(out, mx, my, md, sx, sy, md, epsilon, remainingSteps - 1)
    } else {
      return LineSearch(out, mx, my, md, ex, ey, ed, epsilon, remainingSteps - 1)
    }
  }

  function Dot(ax, ay, bx, by) {
    return ax * bx + ay * by
  }

  function SubdivideSegment(startx, starty, endx, endy, loop, remainingSteps) {
    if (remainingSteps <= 0) {
      return
    }

    let mx = (endx + startx) * 0.5
    let my = (endy + starty) * 0.5
    let normal = [0, 0]
    SDFNormal(normal, mx, my)

    ctx.beginPath()
    ctx.strokeStyle = "#f50"
    ctx.moveTo(mx, my)
    ctx.lineTo(mx + normal[0] * 50.0, my + normal[1] * 50.0)
    ctx.stroke()

    let d = SampleSDF(mx, my)

    if (Math.abs(d) < state.params.epsilon) {
      return
    }


    let nx = endx - startx
    let ny = endy - starty

    let l = Math.sqrt(nx * nx + ny * ny)
    nx /= l
    ny /= l

    // nx *= -Sign(d)
    let found = false
    let foundPos = [0, 0]
    if (state.params.subdivideWhileCollectingLoopsUseSegmentBisector) {

      let ex = mx + ny * d * 2.0
      let ey = my - nx * d * 2.0

      if (state.params.subdivideWhileCollectingLoopsUseBestCagePoint) {
        let bestIndex = -1
        let bestDot = -1
        let bestDistance = -1.0
        let gridx = Math.floor(mx / state.params.cellDiameter) * state.params.cellDiameter
        let gridy = Math.floor(my / state.params.cellDiameter) * state.params.cellDiameter

        // TODO: generate less garbage
        let coords = [
          [gridx, gridy + state.params.cellDiameter],
          [gridx + state.params.cellDiameter, gridy + state.params.cellDiameter],
          [gridx + state.params.cellDiameter, gridy],
          [gridx, gridy],
        ]

        coords.forEach((coord, coordIndex) => {
          let x = -(coord[0] - mx)
          let y = -(coord[1] - my)

          let result = Dot(x, y, ny, -nx)
          if (result > bestDot) {
            bestDot = result
            bestIndex = coordIndex
            bestDistance = Math.sqrt(x*x + y*y) * Sign(d)
          }
        })

        if (bestDot <= 0) {
          console.log(bestDot, bestIndex)
        }

        // Reduce the max distance by half in an attempt to avoid collecting features from other
        // parts of the isosurface.
        bestDistance *= 0.5

        ex = mx + ny * bestDistance
        ey = my - nx * bestDistance
      }

      found = LineSearch(foundPos, mx, my, d, ex, ey, SampleSDF(ex, ey), state.params.epsilon, 20)
      if (found) {
        ctx.beginPath()
        ctx.strokeStyle = "#fff"
        ctx.moveTo(mx, my)
        ctx.lineTo(ex, ey)
        ctx.stroke()
      }
    }

    if (!found) {
      // negate normal so we point towards the surface
      let ex = mx + -normal[0] * d
      let ey = my + -normal[1] * d
      found = LineSearch(foundPos, mx, my, d, ex, ey, SampleSDF(ex, ey), state.params.epsilon, 20)
      if (found) {
        ctx.beginPath()
        ctx.strokeStyle = "#f0f"
        ctx.moveTo(mx, my)
        ctx.lineTo(ex, ey)
        ctx.stroke()
      }
    }


    // ctx.beginPath()
    // ctx.strokeStyle = found ? "green" : 'red'
    // ctx.lineWidth = 1;
    // ctx.moveTo(mx, my)
    // ctx.lineTo(ex, ey)
    // ctx.stroke()

    if (found) {

      ctx.fillStyle = "#0FF"
      ctx.moveTo(foundPos[0], foundPos[1])
      ctx.arc(foundPos[0], foundPos[1], Math.min(4.0, 8.0 / (state.camera.state.zoom * 0.75)), 0, TAU)
      ctx.fill()

      SubdivideSegment(startx, starty, foundPos[0], foundPos[1], loop, remainingSteps - 1)

      loop.push(state.primalVertices.length)
      state.primalVertices.push(foundPos)

      SubdivideSegment(foundPos[0], foundPos[1], endx, endy, loop, remainingSteps - 1)

    }
  }

  async function RenderFrame() {
    ReadParams()
    const needRebuild = state.dirty || state.camera.dirty
    if (!needRebuild && !state.camera.dirty) {
      window.requestAnimationFrame(RenderFrame)
      return
    }

    state.dirty = false

    const cellDiameter = state.params.cellDiameter
    const cellRadius = cellDiameter / 2

    ctx.reset()
    state.camera.begin()
    ctx.scale(1, -1)
    ctx.translate(0, -canvas.height)
    ctx.lineWidth = 1.0 / state.camera.state.zoom

    if (needRebuild) {
      for (let y = 0; y < canvas.height; y++) {
        let yoff = y * canvas.width * 4;
        for (let x = 0; x < canvas.width; x++) {
          let offset = yoff + x * 4
          let d = SampleSDF(x, y)

          if (Math.abs(d) <= 1.0) {
            imageData.data[offset + 0] = 0x5a
            imageData.data[offset + 1] = 0xb5
            imageData.data[offset + 2] = 0x52
            imageData.data[offset + 3] = 0xFF

          } else {
            imageData.data[offset + 0] = 11
            imageData.data[offset + 1] = 11
            imageData.data[offset + 2] = 11
            imageData.data[offset + 3] = 0xFF
          }
        }
      }
      state.bitmap.putImageData(imageData, 0, 0)
    }

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(state.bitmap.canvas, 0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = true

    // compute a grid of corner oriented values
    let grid = null
    {
      const TAU = Math.PI * 2.0
      let latticeDiameter = canvas.width / cellDiameter + 1
      const cellCount = latticeDiameter * latticeDiameter
      grid = new Float32Array(cellCount)
      let padding = cellDiameter * 0.1
      let halfPadding = padding / 2
      for (let y = 0; y < latticeDiameter; y++) {
        let yoff = y * latticeDiameter
        for (let x = 0; x < latticeDiameter; x++) {
          let d = SampleSDF(x * cellDiameter, y * cellDiameter)
          grid[yoff + x] = d
          ctx.strokeStyle = "#444"
          ctx.strokeRect(
            x * cellDiameter + halfPadding,
            y * cellDiameter + halfPadding,
            cellDiameter - padding,
            cellDiameter - padding
          )
          if (d <= 0.0) {
            ctx.fillStyle = "#5ab552"
          } else {
            ctx.fillStyle = "#3388de"
          }
          ctx.beginPath()
          ctx.arc(
            x * cellDiameter,
            y * cellDiameter,
            halfPadding,
            0,
            TAU
          )
          ctx.fill()
        }
      }
    }


    // collect edges that have crossings
    let latticeDiameter = canvas.width / cellDiameter + 1
    const cellCount = latticeDiameter * latticeDiameter

    if (needRebuild) {
      state.borderCrossingCells = []
      state.cellCodes = new Uint8Array(cellCount)
      state.cellPrimalVertIndices = new Int32Array(cellCount * 4)
      state.primalVertices = []
      let padding = 10
      let halfPadding = padding / 2
      ctx.save()
      ctx.strokeStyle = "orange"
      ctx.lineCap = 'round'
      const lineIntersection = [0, 0]

      for (let y = 0; y < latticeDiameter; y++) {
        let yoff = y * latticeDiameter
        for (let x = 0; x < latticeDiameter; x++) {

          let bl = Sign(grid[yoff + x])
          let br = Sign(grid[yoff + x + 1])
          let ul = Sign(grid[yoff + latticeDiameter + x])
          let ur = Sign(grid[yoff + latticeDiameter + x + 1])

          /*
            bit ordering - counter clockwise (from the paper)
            bl, br, ur, ul

            3 2
            +-+
            . .
            +-+
            0 1
          */

          let code = (
            ((ul < 0.0 ? 1 : 0) << 0) |
            ((ur < 0.0 ? 1 : 0) << 1) |
            ((br < 0.0 ? 1 : 0) << 2) |
            ((bl < 0.0 ? 1 : 0) << 3)
          )

          state.cellCodes[yoff + x] = code

          if (code == 0 || code == 0b1111) {
            continue;
          }

          ctx.strokeStyle = "#ac2847"
          ctx.fillStyle = "#ec273f"
          // (0, 0) -> (1, 0)
          if (bl != br) {
            LineSearch(
              lineIntersection,
              x * cellDiameter,
              y * cellDiameter,
              grid[yoff + x],
              (x + 1) * cellDiameter,
              (y) * cellDiameter,
              grid[yoff + x + 1],
              0.1
            )

            ctx.beginPath()
            ctx.moveTo(
              x * cellDiameter + 10,
              y * cellDiameter
            )
            ctx.lineTo(
              (x + 1) * cellDiameter - 10,
              (y) * cellDiameter
            )
            ctx.stroke()

            ctx.beginPath()
            ctx.arc(
              lineIntersection[0],
              lineIntersection[1],
              3,
              0,
              TAU
            )
            ctx.fill();

            state.cellPrimalVertIndices[(yoff + x) * 4 + 2] = state.primalVertices.length
            state.primalVertices.push(lineIntersection.slice())
          } else {
            state.cellPrimalVertIndices[(yoff + x) * 4 + 2] = -1
          }

          // (0, 0) -> (0, 1)
          if (bl != ul) {
            LineSearch(
              lineIntersection,
              x * cellDiameter,
              y * cellDiameter,
              grid[yoff + x],
              (x) * cellDiameter,
              (y + 1) * cellDiameter,
              grid[yoff + latticeDiameter + x],
              0.1
            )

            ctx.beginPath()
            ctx.moveTo(
              x * cellDiameter,
              y * cellDiameter + 10
            )
            ctx.lineTo(
              (x) * cellDiameter,
              (y + 1) * cellDiameter - 10
            )
            ctx.stroke()

            ctx.beginPath()
            ctx.arc(
              lineIntersection[0],
              lineIntersection[1],
              3,
              0,
              TAU
            )
            ctx.fill();

            state.cellPrimalVertIndices[(yoff + x) * 4 + 3] = state.primalVertices.length
            state.primalVertices.push(lineIntersection.slice())
          } else {
            state.cellPrimalVertIndices[(yoff + x) * 4 + 3] = -1
          }

          state.borderCrossingCells.push(yoff + x)
        }
      }
    }

    // Convienience: each cell stores all primal vertex indices
    {
      const stride = 4
      const latticeStride = latticeDiameter * stride
      state.borderCrossingCells.forEach(cellIndex => {
        let offset = cellIndex * stride
        state.cellPrimalVertIndices[offset + 0] = state.cellPrimalVertIndices[offset + latticeStride + 2]
        state.cellPrimalVertIndices[offset + 1] = state.cellPrimalVertIndices[offset + stride + 3]
      })
    }

    /*

    Vert ordering
    0      1
      +--+
      |  |
      +--+
    3      2

    Edge Ordering
       0
      +--+
    3 |  | 1
      +--+
       2
    */
    const CodeToEdges = {
      1: [[0, 3]],
      2: [[1, 0]],
      3: [[1, 3]],
      4: [[2, 1]],
      5: [[0, 3], [2, 1]],
      6: [[2, 0]],
      7: [[2, 3]],
      8: [[3, 2]],
      9: [[0, 2]],
      10: [[1, 0], [3, 2]],
      11: [[1, 2]],
      12: [[3, 1]],
      13: [[0, 1]],
      14: [[3, 0]],
    }

    let CellEdgeTransition = [
      latticeDiameter,
      1,
      -latticeDiameter,
      -1
    ]

    let EdgePairings = [2, 3, 0, 1]

    // draw raw primal segments
    if (false) {
      if (needRebuild) {
        state.primalSegments = []
        state.borderCrossingCells.forEach(cellIndex => {
          let code = state.cellCodes[cellIndex]
          let entry = CodeToEdges[code]
          let indicesOffset = cellIndex * 4
          entry.forEach(pair => {
            let primalIndexA = state.cellPrimalVertIndices[indicesOffset + pair[0]]
            let primalIndexB = state.cellPrimalVertIndices[indicesOffset + pair[1]]
            state.primalSegments.push([primalIndexA, primalIndexB])
          })
        })
      }

      ctx.save()
      ctx.strokeStyle = '#fa6e79'
      ctx.lineWidth = 1;
      ctx.beginPath()
      state.primalSegments.forEach(segment => {
        let primalVertA = state.primalVertices[segment[0]]
        let primalVertB = state.primalVertices[segment[1]]

        let dx = primalVertB[0] - primalVertA[0]
        let dy = primalVertB[1] - primalVertA[1]

        let l = Math.sqrt(dx * dx + dy * dy)
        dx /= l
        dy /= l
        let padding = 0.125

        ctx.moveTo(primalVertA[0] + dx * l * padding, primalVertA[1] + dy * l * padding)
        ctx.lineTo(primalVertB[0] - dx * l * padding, primalVertB[1] - dy * l * padding)

        ctx.stroke()
      })

      ctx.restore();
    }

    // Walk the edges collecting loops
    if (needRebuild) {
      let cellVisited = new Uint8Array(cellCount)
      state.loops = []
      let loop = []
      let queue = []
      // Populate the queue with a single item
      {
        state.borderCrossingCells.reverse().forEach(cellIndex => {
          let code = state.cellCodes[cellIndex]
          let edges = CodeToEdges[code]
          queue.push({
            cellIndex,
            edgeIndex: edges[0][0]
          })
        })
      }

      while (queue.length) {
        let job = queue.pop()
        let cellIndex = job.cellIndex

        let code = state.cellCodes[cellIndex]
        if (cellVisited[cellIndex] == code) {
          continue;
        }

        let edges = CodeToEdges[code]

        const queueLength = queue.length
        for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {

          let edgePair = edges[edgeIndex]

          let startEdge = edgePair[0]
          let endEdge = edgePair[1]

          let startMask = 1 << startEdge
          let endMask = 1 << endEdge
          let visited = cellVisited[cellIndex]
          if ((visited & startMask) != 0) {
            continue
          }
          if ((cellVisited[cellIndex] & endMask) != 0) {
            continue
          }

          // Skip edges that do not continue the current contour
          if (startEdge != job.edgeIndex) {
            // Note: put this at the front of the queue so that we don't end up processing it first
            //       the priority is to continue the contour that got us to this cell
            queue.unshift({
              cellIndex: cellIndex,
              edgeIndex: startEdge
            })
            continue
          }

          cellVisited[cellIndex] |= (startMask | endMask)

          let startVertIndex = state.cellPrimalVertIndices[cellIndex * 4 + startEdge]
          let endVertIndex = state.cellPrimalVertIndices[cellIndex * 4 + endEdge]
          if (startVertIndex < 0 || endVertIndex < 0) {
            continue;
          }

          if (loop.length == 0) {
            loop.push(startVertIndex)
          }

          if (state.params.subdivideWhileCollectingLoops) {
            let start = state.primalVertices[startVertIndex]
            let end = state.primalVertices[endVertIndex]
            SubdivideSegment(start[0], start[1], end[0], end[1], loop, state.params.subdivideWhileCollectingLoopsMaxSubdivisions)
          }

          loop.push(endVertIndex)

          let transition = CellEdgeTransition[endEdge]
          let nextCellIndex = cellIndex + transition
          queue.push({
            cellIndex: nextCellIndex,
            edgeIndex: EdgePairings[endEdge]
          })
        }

        // finalize the current loop
        if (queueLength == queue.length) {
          state.loops.push(loop)
          loop = []
        }
      }
    }

    // draw contours
    if (true) {
      ctx.save()
      state.loops.forEach((vertIndices, loopIndex) => {
        let r = ((loopIndex + 1) * 158) % 255
        let g = ((loopIndex + 1) * 2 * 156) % 255
        let b = ((loopIndex + 1) * 3 * 159) % 127
        ctx.strokeStyle = `rgb(${r},${g},${b})`
        ctx.beginPath()
        ctx.lineWidth = 1
        vertIndices.forEach((vertIndex, i) => {
          let vert = state.primalVertices[vertIndex]
          if (i == 0) {
            ctx.moveTo(vert[0], vert[1])
          } else {
            ctx.lineTo(vert[0], vert[1])
          }
        })
        ctx.stroke()
      })
      ctx.restore()
    }

    // Draw border cell text
    {
      // only draw text when the camera is zoomed in
      if (state.camera.state.zoom >= 2.0) {
        for (let y = 0; y < latticeDiameter; y++) {
          let yoff = y * latticeDiameter
          for (let x = 0; x < latticeDiameter; x++) {
            let code = state.cellCodes[yoff + x]
            if (code === 0 || code === 0b1111) {
              continue
            }

            ctx.save()
            ctx.scale(1, -1)
            ctx.translate(0, -canvas.height)
            ctx.fillStyle = '#ffd1d5'
            ctx.font = `${Math.min(30, 12 / state.camera.state.zoom)}px Hack, monospace`
            ctx.fillText(
              `${yoff + x}`,
              x * cellDiameter + 5,
              canvas.height - (y + 1) * cellDiameter + 14
            )
            ctx.fillText(
              `${code.toString(2).padStart(4, '0')}b ${code}`,
              x * cellDiameter + 5,
              canvas.height - (y + 1) * cellDiameter + 20
            )
            ctx.restore()
          }
        }
      }
    }

    state.camera.end()
    ctx.restore()
    window.requestAnimationFrame(RenderFrame)
  }

  RenderFrame()
}

IsosurfaceExtraction2DBegin()