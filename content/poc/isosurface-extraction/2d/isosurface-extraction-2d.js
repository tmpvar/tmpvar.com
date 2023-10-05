import CreateParamReader from "../params.js"
import CreateCamera from "./camera.js"

function Now() {
  if (window.performance && window.performance.now) {
    return window.performance.now()
  } else {
    return Time.now()
  }
}

// see: https://mastodon.gamedev.place/@sjb3d/110957635606866131
let isNegativeScratch = new Float64Array(1)
function IsNegative(num) {
  isNegativeScratch[0] = num
  let uints = new Uint32Array(isNegativeScratch.buffer)
  return (uints[1] & 1 << 31) != 0
}

function IsosurfaceExtractionBegin(rootEl) {
  const TAU = Math.PI * 2.0
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

  function SDFGetMortonCornerCode(cx, cy, radius) {
    let bl = SampleSDF(cx - radius, cy - radius)
    let br = SampleSDF(cx + radius, cy - radius)
    let ul = SampleSDF(cx - radius, cy + radius)
    let ur = SampleSDF(cx + radius, cy + radius)

    return (
      (IsNegative(bl) << 0) |
      (IsNegative(br) << 1) |
      (IsNegative(ul) << 2) |
      (IsNegative(ur) << 3)
    )
  }

  function MortonCornerCodeToMarchingSquaresCode(morton) {
    /*
     morton      marching squares
       2    3      0    1
        +--+        +--+
        |  |   =>   |  |
        +--+        +--+
       0    1      3    2
    */

    return (
      (((morton >> 2) & 1) << 0) |
      (((morton >> 3) & 1) << 1) |
      (((morton >> 1) & 1) << 2) |
      (((morton >> 0) & 1) << 3)
    )
  }


  /*
    Vert ordering
     0     1
      +---+
      |   |
      +---+
     3     2

    Edge Ordering
        0
      +---+
    3 |   | 1
      +---+
        2
  */
  const MarchingSquaresCodeToEdge = {
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

  const TopEdgeIndex = 0
  const LeftEdgeIndex = 3
  const RightEdgeIndex = 1
  const BottomEdgeIndex = 2

  let EdgePairings = {}
  EdgePairings[BottomEdgeIndex] = TopEdgeIndex
  EdgePairings[TopEdgeIndex] = BottomEdgeIndex
  EdgePairings[RightEdgeIndex] = LeftEdgeIndex
  EdgePairings[LeftEdgeIndex] = RightEdgeIndex

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
    let mortonCornerCode = 0
    if (remainingSteps === 0) {
      mortonCornerCode = SDFGetMortonCornerCode(cx, cy, radius)
      crossing = mortonCornerCode !== 0 && mortonCornerCode != 0b1111
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
      mortonCornerCode: mortonCornerCode,
      marchingSquaresCode: MortonCornerCodeToMarchingSquaresCode(mortonCornerCode),
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
      if (state.params.performSubdivision) {
        let radius = canvas.width / 2
        SubdivideSquare(state.cells, radius, radius, radius, state.params.maxSubdivisionDepth)
      } else {
        const diameter = state.params.cellDiameter
        const radius = diameter * 0.5
        state.uniformGridDiameter = canvas.width / diameter
        for (let y = 0; y < state.uniformGridDiameter; y++) {
          let yoff = y * state.uniformGridDiameter
          let cy = y * diameter + radius
          for (let x = 0; x < state.uniformGridDiameter; x++) {
            let cx = x * diameter + radius
            let mortonCornerCode = SDFGetMortonCornerCode(cx, cy, radius)
            let containsContour = mortonCornerCode != 0 && mortonCornerCode != 0b1111
            state.cells.push({
              center: [cx, cy],
              radius: radius,
              mortonCornerCode: mortonCornerCode,
              marchingSquaresCode: MortonCornerCodeToMarchingSquaresCode(mortonCornerCode),
              containsContour: containsContour,
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
      console.log(`FindBoundaryCells cells: ${state.cells.length} boundaryCells: ${state.boundaryCells.length}`)
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
      ctx.fillStyle = "#1e4044"
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

    // Draw cell corner states
    {
      let radius = state.boundaryCells[0].radius
      let corners = [
        [-radius, -radius],
        [+radius, -radius],
        [-radius, +radius],
        [+radius, +radius],
      ]

      state.boundaryCells.forEach(cell => {
        for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
          let mask = 1 << cornerIndex
          let corner = corners[cornerIndex]
          ctx.fillStyle = (mask & cell.mortonCornerCode) != 0
            ? '#9de64e'
            : '#ec273f'
          ctx.beginPath()
          ctx.arc(
            cell.center[0] + corner[0],
            cell.center[1] + corner[1],
            2.0 / state.camera.state.zoom,
            0,
            TAU
          )
          ctx.fill()
        }
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