async function IsosurfaceExtraction2DBegin() {
  const TAU = Math.PI * 2.0

  const rootEl = document.getElementById('isosurface-extraction-2d-content')
  const controlEl = rootEl.querySelector('.controls')
  const canvas = rootEl.querySelector('canvas')
  const ctx = canvas.getContext('2d')
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

  function SDFSphere(px, py, cx, cy, r) {
    let dx = px - cx
    let dy = py - cy
    return Math.sqrt(dx * dx + dy * dy) - r
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

      d = Math.max(d, -SDFSphere(
        x,
        y,
        768,
        512,
        64
      ))
    }

    return d
  }

  function Sign(d) {
    return d <= 0 ? -1 : 1
  }

  function LineSearch(out, sx, sy, sd, ex, ey, ed, epsilon) {
    if (Math.abs(sd) <= epsilon) {
      out[0] = sx
      out[1] = sy
      return
    }

    if (Math.abs(ed) <= epsilon) {
      out[0] = ex
      out[1] = ey
      return
    }

    let mx = (sx + ex) * 0.5
    let my = (sy + ey) * 0.5

    let md = SampleSDF(mx, my);
    if (Math.abs(md) <= epsilon) {
      out[0] = mx
      out[1] = my
      return
    }

    if ((sd < 0.0 && md >= 0) || (sd >= 0.0 && md < 0.0)) {
      LineSearch(out, mx, my, md, sx, sy, md, epsilon)
    } else {
      LineSearch(out, mx, my, md, ex, ey, ed, epsilon)
    }
  }

  async function RenderFrame() {
    const cellDiameter = 32
    const cellRadius = cellDiameter / 2

    ctx.reset()
    ctx.scale(1, -1)
    ctx.translate(0, -canvas.height)
    ctx.translate(-400, -300)
    ctx.scale(4, 4)
    ctx.translate(-200, -30)
    ctx.lineWidth = 0.1
    // fill the canvas with sdf coloring
    {
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
      const bitmap = await createImageBitmap(imageData)
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    }

    // compute a grid of corner oriented values
    let grid = null
    {
      const TAU = Math.PI * 2.0
      let latticeDiameter = canvas.width / cellDiameter + 1
      const cellCount = latticeDiameter * latticeDiameter
      grid = new Float32Array(cellCount)
      let padding = 10
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
            3,
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

    const borderCrossingCells = []
    const cellCodes = new Uint8Array(cellCount)
    const cellEdgeCodes = new Uint8Array(cellCount * 4)

    const cellPrimalVertIndices = new Int32Array(cellCount * 4)
    const primalVertices = []
    {
      let padding = 10
      let halfPadding = padding / 2
      ctx.save()
      ctx.strokeStyle = "orange"
      ctx.lineCap = 'round'
      const lineIntersection = [0, 0]
      const edgeIntersections = [0, 0]

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

          cellCodes[yoff + x] = code

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

            cellPrimalVertIndices[(yoff + x) * 4 + 2] = primalVertices.length
            primalVertices.push(lineIntersection.slice())
          } else {
            cellPrimalVertIndices[(yoff + x) * 4 + 2] = -1
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

            cellPrimalVertIndices[(yoff + x) * 4 + 3] = primalVertices.length
            primalVertices.push(lineIntersection.slice())
          } else {
            cellPrimalVertIndices[(yoff + x) * 4 + 3] = -1
          }

          borderCrossingCells.push(yoff + x)

          ctx.save()
          ctx.scale(1, -1)
          ctx.translate(0, -canvas.height)
          ctx.fillStyle = '#ffd1d5'
          ctx.font = "3px Hack, monospace"
          ctx.fillText(
            `${yoff + x} ${cellCodes[yoff + x].toString(2).padStart(4, '0')}b ${cellCodes[yoff + x]}`,
            x * cellDiameter + 10,
            canvas.height - (y + 1) * cellDiameter + 14
          )
          ctx.restore()
        }
      }

      // Convienience: each cell stores all primal vertex indices
      {
        const stride = 4
        const latticeStride = latticeDiameter * stride
        borderCrossingCells.forEach(cellIndex => {
          let offset = cellIndex * stride
          cellPrimalVertIndices[offset + 0] = cellPrimalVertIndices[offset + latticeStride + 2]
          cellPrimalVertIndices[offset + 1] = cellPrimalVertIndices[offset + stride + 3]
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

      // const edgeCodeLookup = {
      //   1: 0b1000,
      //   2: 0b0001,
      //   3: 0b0001,

      // }

      let CellEdgeTransition = [
        latticeDiameter,
        1,
        -latticeDiameter,
        -1
      ]

      let EdgePairings = [2, 3, 0, 1]

      {
        let primalSegments = []
        borderCrossingCells.forEach(cellIndex => {
          let code = cellCodes[cellIndex]
          let entry = CodeToEdges[code]
          let indicesOffset = cellIndex * 4
          entry.forEach(pair => {
            let primalIndexA = cellPrimalVertIndices[indicesOffset + pair[0]]
            let primalIndexB = cellPrimalVertIndices[indicesOffset + pair[1]]
            primalSegments.push([primalIndexA, primalIndexB])
          })
        })

        console.log(primalSegments)
        console.log(primalVertices)

        ctx.save()
        ctx.strokeStyle = '#fa6e79'
        ctx.lineWidth = 1;
        ctx.beginPath()
        primalSegments.forEach(segment => {
          let primalVertA = primalVertices[segment[0]]
          let primalVertB = primalVertices[segment[1]]

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
      {

        let primalGraph = []
        let cellVisited = new Uint8Array(cellCount)

        let loops = []
        let loop = []
        let steps = 4000
        // TODO: process all crossing cells

        let queue = []
        let nextQueue = []

        // Populate the queue with a single item
        {
          borderCrossingCells.forEach(cellIndex => {
            let code = cellCodes[cellIndex]
            let edges = CodeToEdges[code]
            queue.push({
              cellIndex,
              edgeIndex: edges[0][0]
            })
          })
        }

        while (queue.length && steps--) {
          let job = queue.pop()
          let cellIndex = job.cellIndex

          let code = cellCodes[cellIndex]
          let visited = cellVisited[cellIndex]

          let edges = CodeToEdges[code]

          const queueLength = queue.length
          for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {

            let edgePair = edges[edgeIndex]

            console.log(cellIndex, 'start', edgeIndex, edgePair)
            let startEdge = edgePair[0]
            let endEdge = edgePair[1]

            let startMask = 1 << startEdge
            let endMask = 1 << endEdge

            if ((visited & startMask) != 0) {
              continue
            }
            // Skip edges that do not continue the current contour
            if (startEdge != job.edgeIndex) {
              queue.push({
                cellIndex: cellIndex,
                edgeIndex: startEdge
              })
              console.log(cellIndex, 'miss', startEdge, job.edgeIndex,)
              continue
            }
            console.log(cellIndex, 'hit', startEdge, job.edgeIndex)

            cellVisited[cellIndex] |= (startMask | endMask)

            let startVertIndex = cellPrimalVertIndices[cellIndex * 4 + startEdge]
            let endVertIndex = cellPrimalVertIndices[cellIndex * 4 + endEdge]
            if (startVertIndex < 0 || endVertIndex < 0) {
              continue;
            }
            let startVert = primalVertices[startVertIndex]
            let endVert = primalVertices[endVertIndex]

            if (loop.length == 0) {
              loop.push(startVertIndex)
            }

            loop.push(endVertIndex)

            ctx.fillStyle = "#ff0"
            ctx.beginPath()
            ctx.arc(
              startVert[0],
              startVert[1],
              6,
              0,
              TAU
            )
            ctx.fill();

            ctx.strokeStyle = "#0ff"
            ctx.beginPath()
            ctx.arc(
              endVert[0],
              endVert[1],
              10,
              0,
              TAU
            )
            ctx.stroke();

            let transition = CellEdgeTransition[endEdge]
            console.log('process edge', job.edgeIndex, 'cell', cellIndex, 'nextCell', cellIndex + transition, 'endEdge', endEdge, edges[edgeIndex])
            let nextCellIndex = cellIndex + transition
            queue.push({
              cellIndex: nextCellIndex,
              edgeIndex: EdgePairings[endEdge]
            })
          }

          // finalize the current loop
          if (queueLength == queue.length) {
            console.log('finish loop', loop)
            loops.push(loop)
            loop = []
          }


          loops.forEach((vertIndices, loopIndex) => {
            let r = ((loopIndex + 1) * 158) % 255
            let g = ((loopIndex + 1) * 2 * 156) % 255
            let b = ((loopIndex + 1) * 3 * 159) % 127
            ctx.save()
            ctx.strokeStyle = `rgb(${r},${g},${b})`
            ctx.beginPath()
            ctx.lineWidth = 0.1;
            vertIndices.forEach((vertIndex, i) => {
              let vert = primalVertices[vertIndex]
              if (i == 0) {
                ctx.moveTo(vert[0], vert[1])
              } else {
                ctx.lineTo(vert[0], vert[1])
              }
            })
            ctx.stroke()
            ctx.restore()
          })
        }
      }

      ctx.restore()
    }
  }

  RenderFrame()
}

IsosurfaceExtraction2DBegin()