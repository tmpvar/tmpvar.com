async function IsosurfaceExtraction2DBegin() {

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

  async function RenderFrame() {
    const cellDiameter = 128
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
    const borderCells = []
    const crossingEdges = []
    {
      const TAU = Math.PI * 2.0
      let latticeDiameter = canvas.width / cellDiameter + 1
      const cellCount = latticeDiameter * latticeDiameter

      let padding = 10
      let halfPadding = padding / 2
      ctx.save()
      ctx.strokeStyle = "orange"
      ctx.lineWidth = 3.0;
      ctx.lineCap = 'round'
      for (let y = 0; y < latticeDiameter; y++) {
        let yoff = y * latticeDiameter
        for (let x = 0; x < latticeDiameter; x++) {
          let a = Sign(grid[yoff + x])
          let b = Sign(grid[yoff + x + 1])
          let c = Sign(grid[yoff + latticeDiameter + x])
          let d = Sign(grid[yoff + latticeDiameter + x + 1])

          let code = (
            ((a < 0.0 ? 1 : 0) << 0) |
            ((b < 0.0 ? 1 : 0) << 1) |
            ((c < 0.0 ? 1 : 0) << 2) |
            ((d < 0.0 ? 1 : 0) << 3)
          )

          if (code == 0 || code == 0b1111) {
            continue;
          }

          if (a!=b) {
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
          }

          if (a!=c) {
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
          }

        }
      }
      ctx.restore()
    }


  }

  RenderFrame()
}

IsosurfaceExtraction2DBegin()