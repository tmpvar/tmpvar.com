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
    const cellDiameter = 64
    const cellRadius = cellDiameter / 2

    ctx.reset()
    ctx.scale(1, -1)
    ctx.translate(0, -canvas.height)

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
    const borderCrossings = []
    const gridToCrossingMap = new Int32Array(cellCount)
    const borderCrossingCells = []
    const cellCodes = new Uint8Array(cellCount)
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
            ((bl < 0.0 ? 1 : 0) << 0) |
            ((br < 0.0 ? 1 : 0) << 1) |
            ((ur < 0.0 ? 1 : 0) << 2) |
            ((ul < 0.0 ? 1 : 0) << 3)
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
            edgeIntersections[0] = lineIntersection.slice()
          } else {
            edgeIntersections[0] = false
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
            edgeIntersections[1] = lineIntersection.slice()
          } else {
            edgeIntersections[1] = false
          }

          gridToCrossingMap[yoff + x] = borderCrossings.length
          borderCrossings.push(edgeIntersections.slice())
          borderCrossingCells.push(yoff + x)

          ctx.save()
          ctx.scale(1, -1)
          ctx.translate(0, -canvas.height)
          ctx.fillStyle = '#ffd1d5'
          ctx.font = "12px Hack, monospace"
          ctx.fillText(
            `${yoff + x}`,
            x * cellDiameter + 10,
            canvas.height - (y + 1) * cellDiameter + 14
          )
          ctx.fillText(
            `${gridToCrossingMap[yoff + x]}`,
            x * cellDiameter + 10,
            canvas.height - (y + 1) * cellDiameter + 28
          )
          ctx.fillText(
            `${cellCodes[yoff + x]}`,
            x * cellDiameter + 10,
            canvas.height - (y + 1) * cellDiameter + 42
          )
          ctx.restore()
        }
      }

      {
        /*
         Vert ordering
         3    2
          +--+
          |  |
          +--+
         0    1

         Edge Ordering
            2
           +--+
         3 |  | 1
           +--+
            0
        */
        const lookup = {
          1: [[0, 3]],
          2: [[0, 1]],
          3: [[1, 3]],
          4: [[1, 2]],
          5: [[0, 3], [1, 2]],
          6: [[0, 2]],
          7: [[2, 3]],
          8: [[2, 3]],
          9: [[0, 2]],
          10: [[0, 1], [2, 3]],
          11: [[1, 2]],
          12: [[1, 3]],
          13: [[0, 1]],
          14: [[0, 3]],
        }

        function GetEdge(out, cellIndex, edgeIndex) {
          let crossing = [0, 0]
          switch (edgeIndex) {
            case 0: {
              let crossingIndex = gridToCrossingMap[cellIndex]
              crossing = borderCrossings[crossingIndex][0]
              break;
            }

            case 1: {
              let crossingIndex = gridToCrossingMap[cellIndex + 1]
              crossing = borderCrossings[crossingIndex][1]
              break;
            }

            case 2: {
              let crossingIndex = gridToCrossingMap[cellIndex + latticeDiameter]
              crossing = borderCrossings[crossingIndex][0]
              break;
            }

            case 3: {
              let crossingIndex = gridToCrossingMap[cellIndex]
              crossing = borderCrossings[crossingIndex][1]
              break;
            }
          }

          out[0] = crossing[0]
          out[1] = crossing[1]

          // let crossingIndex = gridToCrossingMap[offsetCellIndex]
          // borderCrossings[crossingIndex]
        }

        let posa = [0, 0]
        let posb = [0, 0]
        ctx.save()
        ctx.strokeStyle = '#f0f'
        ctx.lineWidth = 3;
        borderCrossingCells.forEach(cellIndex => {
          let code = cellCodes[cellIndex]
          let entry = lookup[code]
          console.log(cellIndex, JSON.stringify(entry), code, '0b' + code.toString(2))
          entry.forEach(pair => {

            GetEdge(posa, cellIndex, pair[0])
            GetEdge(posb, cellIndex, pair[1])

            ctx.beginPath()
            ctx.moveTo(posa[0], posa[1])
            ctx.lineTo(posb[0], posb[1])
            ctx.stroke()
          })
        })
        ctx.restore();
      }
      ctx.restore()
    }


  }

  RenderFrame()
}

IsosurfaceExtraction2DBegin()