import CreateParamReader from "../params.js"
import CreateCamera from "./camera.js"

function Now() {
  if (window.performance && window.performance.now) {
    return window.performance.now()
  } else {
    return Time.now()
  }
}

function IsosurfaceExtractionBegin(rootEl) {
  const controlEl = rootEl.querySelector('.controls')
  const canvas = rootEl.querySelector('canvas')
  const ctx = canvas.getContext('2d')

  const state = {
    dirty: true,
    params: {},
    timings: [],
    camera: CreateCamera(ctx),
  }

  function TimedBlock(label, cb) {
    if (!cb) {
      console.warn('invalid callback passed to TimedBlock')
      return
    }
    let start = Now()
    let ret = cb()
    let end = Now()
    state.timings.push({ label, elapsed: end - start })
    return ret
  }

  const Param = CreateParamReader(state, controlEl)
  function ReadParams() {
    Param('debugPerformance', 'bool')
    Param('performSubdivision', 'bool')
    Param('contourExtractionApproach', 'string')

    Param('cellDiameter', 'i32', (parentEl, value, oldValue) => {
      let newValue = Math.pow(2, value)
      parentEl.querySelector('output').innerHTML = `2<sup>${value}</sup> = ${newValue}`
      return newValue
    })


    Param('epsilon', 'f32')
    Param('isolevel', 'f32')
    Param('maxSubdivisionDepth', 'i32')
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

  function SubdivideSquare(nodes, cx, cy, radius, remainingSteps) {
    ctx.strokeStyle = "#444"
    let padding = radius / remainingSteps
    let diameter = radius * 2.0
    ctx.strokeRect(
      (cx - radius),
      (cy - radius),
      diameter,
      diameter
    )

    let d = SampleSDF(cx, cy)

    let crossing = Math.abs(d) <= radius * 1.4142135623730951
    let containsContour = false
    if (remainingSteps === 0) {
      let mask = 0
      let corners = [
        [cx - radius, cy - radius],
        [cx + radius, cy - radius],
        [cx - radius, cy + radius],
        [cx + radius, cy + radius],
      ]

      corners.forEach((corner, i) => {
        let d = SampleSDF(corner[0], corner[1])
        if (d < 0) {
          mask |= 1 << i
        }
      })

      crossing = mask !== 0 && mask != 0b1111
      containsContour = crossing
    }

    let nodeIndex = nodes.length
    let node = {
      index: nodeIndex,
      center: [cx, cy],
      radius: radius,
      distance: d,
      children: [-1, -1, -1, -1],
      parent: -1,
      parentQuadrant: 0,
      mask: 0,
      remainingSteps: remainingSteps,
      crossing: crossing,
      containsContour: containsContour
    }
    nodes.push(node)

    if (remainingSteps == 0) {
      return nodeIndex
    }

    if (crossing) {
      let nextRadius = radius * 0.5
      let coords = [
        [cx - nextRadius, cy - nextRadius],
        [cx + nextRadius, cy - nextRadius],
        [cx - nextRadius, cy + nextRadius],
        [cx + nextRadius, cy + nextRadius],
      ]

      coords.forEach((coord, i) => {
        let childNodeIndex = SubdivideSquare(
          nodes,
          coord[0],
          coord[1],
          nextRadius,
          remainingSteps - 1
        )
        if (childNodeIndex > -1) {
          node.mask |= 1 << i
          nodes[childNodeIndex].parent = nodeIndex
          nodes[childNodeIndex].parentQuadrant = i
        }
        node.children[i] = childNodeIndex

      })
      return nodeIndex
    }

    return nodeIndex
  }


  function FindBoundaryCells() {
    return TimedBlock('Find Boundary Cells', () => {
      state.cells = []
      state.boundaryCells = []
      if (state.params.performSubdivision) {
        let radius = canvas.width / 2
        SubdivideSquare(state.cells, radius, radius, radius, state.params.maxSubdivisionDepth)
      } else {
        state.cells = []
        let radius = state.params.cellDiameter * 0.5
        for (let x = 0; x < canvas.width; x += state.params.cellDiameter) {
          for (let y = 0; y < canvas.height; y += state.params.cellDiameter) {

            let code = (
              (SampleSDF(x, y) < 0) |
              (SampleSDF(x + radius, y) < 0) |
              (SampleSDF(x, y + radius) < 0) |
              (SampleSDF(x + radius, y + radius) < 0)
            )


            state.cells.push({
              center: [x + radius, y + radius],
              radius: radius,
              mortonCornerCode: code,
              containsContour: code != 0 && code != 0b1111,
            })
          }
        }
      }

      state.boundaryCells = state.cells.filter(cell => cell.containsContour)
    })
  }

  function DrawFrame() {
    ReadParams()
    const dirty = state.dirty || state.camera.dirty
    if (!dirty) {
      requestAnimationFrame(DrawFrame)
      return
    }

    if (state.dirty) {
      state.timings = []
    }

    ctx.reset()
    state.camera.begin()
    ctx.fillStyle = "rgb(11, 11, 11)"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(1, -1)
    ctx.translate(0, -canvas.height)

    ctx.lineWidth = 1.0 / state.camera.state.zoom

    if (state.dirty) {
      FindBoundaryCells()
    }

    // Draw all cells
    {
      ctx.strokeStyle = "#444"
      state.cells.forEach(cell => {
        let diameter = cell.radius * 2.0
        ctx.strokeRect(
          (cell.center[0] - cell.radius),
          (cell.center[1] - cell.radius),
          diameter,
          diameter
        )
      })
    }

    // Draw boundary cells
    {
      ctx.fillStyle = "#26854c"
      state.boundaryCells.forEach(cell => {
        let diameter = cell.radius * 2.0
        ctx.fillRect(
          (cell.center[0] - cell.radius),
          (cell.center[1] - cell.radius),
          diameter,
          diameter
        )
      })
    }

    state.camera.end()
    state.dirty = false

    if (state.params.debugPerformance) {
      let totalMs = 0.0
      let output = ''
      state.timings.forEach(entry => {
        let ms = entry.elapsed
        totalMs += ms
        output += `${ms.toFixed(2)}ms ${entry.label}\n`
      })
      output += `------\n`
      output += `${totalMs.toFixed(2)}ms total\n`

      controlEl.querySelector('.debugPerformance-control .performance-output code pre').innerText = output;
    }

    requestAnimationFrame(DrawFrame)
  }

  DrawFrame()
}

IsosurfaceExtractionBegin(
  document.querySelector('#isosurface-extraction-2d-content')
)