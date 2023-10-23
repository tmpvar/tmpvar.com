import CreateParamReader from "./params.js"
import CreateCamera from "./camera.js"
import { orient2d } from "./orient2d.js"
import RobustPointInPolygon from "./robust-point-in-polygon.js"

function Now() {
  if (window.performance && window.performance.now) {
    return window.performance.now()
  } else {
    return Time.now()
  }
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

function IsosurfaceExtractionBegin(rootEl) {
  const Min = Math.min
  const Max = Math.max

  const EdgesPerCell = 4
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

  function Assert(cond, msg) {
    if (!cond) {
      throw new Error('assertion failure: ' + msg)
    }
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
    Param('debugDrawNodeCornerState', 'bool')
    Param('debugDrawNodeEdgeState', 'bool')
    Param('debugDrawLooseEdgeVertices', 'bool')
    Param('debugDrawBoundaryCells', 'bool')
    Param('debugDrawGrid', 'bool')
    Param('debugLoopCollectionMaxSteps', 'i32')
    Param('debugDrawCellTextualInfo', 'bool')

    Param('performSubdivision', 'bool')
    Param('contourExtractionApproach', 'string')

    Param('cellDiameter', 'i32', (parentEl, value, oldValue) => {
      let newValue = Math.pow(2, value)
      parentEl.querySelector('output').innerHTML = `2<sup>${value}</sup> = ${newValue}`
      return newValue
    })


    Param('epsilon', 'f32')
    Param('isolevel', 'f32')
    Param('lineSearchMaxSteps', 'i32')
    Param('maxSubdivisionDepth', 'i32')
  }

  function Clamp(v, lo, hi) {
    return Min(hi, Max(v, lo))
  }

  function Length(x, y) {
    return Math.sqrt(x * x + y * y)
  }

  function LengthSquared(x, y) {
    return x * x + y * y
  }

  function Dot(ax, ay, bx, by) {
    return ax * bx + ay * by
  }

  function SDFSphere(px, py, cx, cy, r) {
    return Length(px - cx, py - cy) - r
  }

  function SDFBox(px, py, bx, by) {
    let dx = Math.abs(px) - bx;
    let dy = Math.abs(py) - by;

    let l = Math.sqrt(
      Math.pow(Max(dx, 0.0), 2) +
      Math.pow(Max(dy, 0.0), 2)
    )
    return l + Min(Max(dx, dy), 0.0);
  }

  function SDFSegment(px, py, ax, ay, bx, by, segmentEpsilon = 1e-1) {
    let pax = px - ax
    let pay = py - ay
    let bax = bx - ax
    let bay = by - ay

    let h = Clamp(
      Dot(pax, pay, bax, bay) / Dot(bax, bay, bax, bay),
      0.0,
      1.0
    );

    let d = Length(
      pax - bax * h,
      pay - bay * h
    )

    // We only count crossings, but a segment has no area so it needs
    // to be inflated by a small value
    return d - segmentEpsilon;
  }

  function SDFPolygon(px, py, loop) {
    let s = RobustPointInPolygon(loop, px, py) ? 1.0 : -1.0
    let d = LengthSquared(
      px - loop[0][0],
      py - loop[0][1]
    )

    // let s = 1.0
    let N = loop.length
    for (let i = 0, j = N - 1; i < N; j = i, i++) {
      let ix = loop[i][0]
      let iy = loop[i][1]
      let jx = loop[j][0]
      let jy = loop[j][1]
      let ex = jx - ix
      let ey = jy - iy

      let wx = px - ix;
      let wy = py - iy;
      let ed = LengthSquared(ex, ey)
      let r = Clamp(
        Dot(wx, wy, ex, ey) / ed,
        0.0,
        1.0
      )

      let bx = wx - ex * r;
      let by = wy - ey * r;

      // iq's crossing counter
      // let ca = py >= iy
      // let cb = py < j.y
      // let cc = ex * wy > ey * wx
      // if ((ca && cb && cc) || (!ca && !cb && !cc)) {
      //   s = -s;
      // }


      d = Min(d, LengthSquared(bx, by));
    }

    return s * Math.sqrt(d);
  }

  function SampleSDF(x, y) {
    let d = Infinity;

    // Polyloop
    // TODO: this works when the isolevel is != 0, probably because we use a sign
    //       crossing to split cells and collect contours
    if (0) {
      d = Min(d, SDFPolygon(x, y, [
        [512, 250],
        [768, 250],
        [768, 500],
        [512, 500],
      ]))
    }

    // spheres
    if (1) {
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
    d = Max(d, SDFBox(rx - x, ry - y, rx - 10, ry - 10))
    // d = Min(d, SDFBox(rx - x, ry - y, rx, ry))

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

  function LineSearch(out, sx, sy, sd, ex, ey, ed, epsilon, remainingSteps) {
    if (!ContainsCrossing(sd, ed)) {
      console.error("invalid line distances")
      return false
    }

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
      console.warn("ran out of steps")
      return false
    }


    if (ContainsCrossing(sd, md)) {
      return LineSearch(out, mx, my, md, sx, sy, sd, epsilon, remainingSteps - 1)
    }

    if (ContainsCrossing(md, ed)) {
      return LineSearch(out, mx, my, md, ex, ey, ed, epsilon, remainingSteps - 1)
    }

    return false
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
      (((morton >> 0) & 1) << BottomLeftCornerIndex) |
      (((morton >> 1) & 1) << BottomRightCornerIndex) |
      (((morton >> 2) & 1) << TopLeftCornerIndex) |
      (((morton >> 3) & 1) << TopRightCornerIndex)
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
    5: [
      [[0, 3], [2, 1]],
      [[0, 1], [2, 3]]
    ],
    6: [[2, 0]],
    7: [[2, 3]],
    8: [[3, 2]],
    9: [[0, 2]],
    10: [
      [[1, 0], [3, 2]],
      [[3, 0], [1, 2]]
    ],
    11: [[1, 2]],
    12: [[3, 1]],
    13: [[0, 1]],
    14: [[3, 0]],
  }

  const TopEdgeIndex = 0
  const RightEdgeIndex = 1
  const BottomEdgeIndex = 2
  const LeftEdgeIndex = 3

  const TopLeftCornerIndex = 0
  const TopRightCornerIndex = 1
  const BottomRightCornerIndex = 2
  const BottomLeftCornerIndex = 3

  let EdgePairings = {}
  EdgePairings[TopEdgeIndex] = BottomEdgeIndex
  EdgePairings[RightEdgeIndex] = LeftEdgeIndex
  EdgePairings[BottomEdgeIndex] = TopEdgeIndex
  EdgePairings[LeftEdgeIndex] = RightEdgeIndex

  let EdgeNames = {}
  EdgeNames[TopEdgeIndex] = 'Top'
  EdgeNames[RightEdgeIndex] = 'Right'
  EdgeNames[BottomEdgeIndex] = 'Bottom'
  EdgeNames[LeftEdgeIndex] = 'Left'


  function SubdivideSquare(nodes, cx, cy, radius, remainingSteps) {
    let d = SampleSDF(cx, cy)

    let containsContour = Math.abs(d) <= radius * 1.4142135623730951
    let mortonCornerCode = 0
    if (remainingSteps === 0) {
      mortonCornerCode = SDFGetMortonCornerCode(cx, cy, radius)
    }

    let nodeIndex = nodes.length
    let node = {
      index: nodeIndex,
      center: [cx, cy],
      radius: radius,
      children: [-1, -1, -1, -1],
      parent: -1,
      parentQuadrant: 0,
      mortonCornerCode: mortonCornerCode,
      marchingSquaresCode: MortonCornerCodeToMarchingSquaresCode(mortonCornerCode),
      remainingSteps: remainingSteps,
      leaf: remainingSteps === 0,
      containsContour: containsContour
    }
    nodes.push(node)

    if (remainingSteps == 0) {
      return nodeIndex
    }

    if (containsContour) {
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
              leaf: true,
              containsContour: containsContour,
              gridIndex: yoff + x,
            })
          }
        }
      }

      state.boundaryCells = state.cells.filter(cell => cell.leaf && cell.containsContour)
      state.boundaryCells.forEach((cell, boundaryCellIndex) => {
        cell.boundaryCellIndex = boundaryCellIndex
      })
    })
  }

  function HorizontalProc(nodes, edges, leftNodeIndex, rightNodeIndex) {
    if (leftNodeIndex == -1 || rightNodeIndex == -1) {
      return
    }

    let leftNode = nodes[leftNodeIndex]
    let rightNode = nodes[rightNodeIndex]

    if (
      rightNode.leaf && rightNode.containsContour &&
      leftNode.leaf && leftNode.containsContour
    ) {
      let leftBoundaryCellIndex = leftNode.boundaryCellIndex
      let rightBoundaryCellIndex = rightNode.boundaryCellIndex

      edges[rightBoundaryCellIndex * EdgesPerCell + LeftEdgeIndex] = leftBoundaryCellIndex
      edges[leftBoundaryCellIndex * EdgesPerCell + RightEdgeIndex] = rightBoundaryCellIndex
      return
    }

    // left is a leaf
    if (leftNode.boundaryCellIndex > -1) {
      HorizontalProc(nodes, edges, leftNodeIndex, rightNode.children[0]);
      HorizontalProc(nodes, edges, leftNodeIndex, rightNode.children[2]);
      return;
    }

    // right is a leaf
    if (rightNode.boundaryCellIndex > -1) {
      HorizontalProc(nodes, edges, leftNode.children[1], rightNodeIndex);
      HorizontalProc(nodes, edges, leftNode.children[3], rightNodeIndex);
      return;
    }

    HorizontalProc(nodes, edges, leftNode.children[1], rightNode.children[0]);
    HorizontalProc(nodes, edges, leftNode.children[3], rightNode.children[2]);
  }

  function VerticalProc(nodes, edges, upperNodeIndex, lowerNodeIndex) {
    if (upperNodeIndex == -1 || lowerNodeIndex == -1) {
      return
    }

    let upperNode = nodes[upperNodeIndex]
    let lowerNode = nodes[lowerNodeIndex]

    if (
      upperNode.leaf && upperNode.containsContour &&
      lowerNode.leaf && lowerNode.containsContour
    ) {
      let upperBoundaryCellIndex = upperNode.boundaryCellIndex
      let lowerBoundaryCellIndex = lowerNode.boundaryCellIndex

      edges[upperBoundaryCellIndex * EdgesPerCell + BottomEdgeIndex] = lowerBoundaryCellIndex
      edges[lowerBoundaryCellIndex * EdgesPerCell + TopEdgeIndex] = upperBoundaryCellIndex
      return
    }

    // upper is a leaf
    if (upperNode.boundaryCellIndex > -1) {
      VerticalProc(nodes, edges, upperNodeIndex, lowerNode.children[2]);
      VerticalProc(nodes, edges, upperNodeIndex, lowerNode.children[3]);
      return
    }

    // lower is a leaf
    if (lowerNode.boundaryCellIndex > -1) {
      VerticalProc(nodes, edges, upperNode.children[0], lowerNodeIndex);
      VerticalProc(nodes, edges, upperNode.children[1], lowerNodeIndex);
      return;
    }

    VerticalProc(nodes, edges, upperNode.children[0], lowerNode.children[2]);
    VerticalProc(nodes, edges, upperNode.children[1], lowerNode.children[3]);
  }

  function FaceProc(nodes, edges, nodeIndex) {
    let node = nodes[nodeIndex]
    if (!nodes[nodeIndex].mask) {
      return
    }

    for (let childIndex = 0; childIndex < 4; childIndex++) {
      let childNodeIndex = node.children[childIndex]
      if (childNodeIndex == -1) {
        continue
      }
      FaceProc(nodes, edges, childNodeIndex)
    }

    VerticalProc(nodes, edges, node.children[2], node.children[0])
    VerticalProc(nodes, edges, node.children[3], node.children[1])
    HorizontalProc(nodes, edges, node.children[0], node.children[1])
    HorizontalProc(nodes, edges, node.children[2], node.children[3])
  }

  function ComputeEdgeNeighbors() {
    const edgeCount = state.cells.length * EdgesPerCell
    state.edges = new Int32Array(edgeCount)
    state.edges.fill(-1)

    if (state.params.performSubdivision) {
      FaceProc(state.cells, state.edges, 0)
    } else {
      let boundaryCellGrid = new Int32Array(state.cells.length)
      boundaryCellGrid.fill(-1)

      const CellEdgeTransition = [
        state.uniformGridDiameter,
        1,
        -state.uniformGridDiameter,
        -1
      ]

      state.boundaryCells.forEach((cell, cellIndex) => {
        boundaryCellGrid[cell.gridIndex] = cellIndex
      })

      state.boundaryCells.forEach((cell, cellIndex) => {
        let currentEdgeOffset = cellIndex * EdgesPerCell
        for (let i = 0; i < 4; i++) {
          let otherGridIndex = cell.gridIndex + CellEdgeTransition[i]
          if (otherGridIndex < 0 || otherGridIndex > boundaryCellGrid.length) {
            continue
          }

          state.edges[currentEdgeOffset + i] = boundaryCellGrid[otherGridIndex]
        }
      })
    }
  }

  function ComputeVertices() {
    const cellCount = state.boundaryCells.length
    state.cellVertexIndices = new Int32Array(cellCount * EdgesPerCell)
    state.cellDistances = new Float32Array(cellCount * EdgesPerCell)
    state.cellVertices = []
    let lineIntersection = [0, 0]
    let radius = state.boundaryCells[0].radius
    let corners = {}
    corners[TopLeftCornerIndex] = [-radius, +radius]
    corners[TopRightCornerIndex] = [+radius, +radius]
    corners[BottomRightCornerIndex] = [+radius, -radius]
    corners[BottomLeftCornerIndex] = [-radius, -radius]

    // compute the distance to the upper left corner
    state.boundaryCells.forEach((cell, cellIndex) => {
      let cellOffset = cellIndex * EdgesPerCell
      // TODO: cache these instead of recomputing them..
      for (let cornerIndex = 0; cornerIndex < 4; cornerIndex++) {
        let d = SampleSDF(
          cell.center[0] + corners[cornerIndex][0],
          cell.center[1] + corners[cornerIndex][1],
        )

        state.cellDistances[cellOffset + cornerIndex] = d
      }
    })

    // compute the bottom and left edges
    state.boundaryCells.forEach(cell => {
      let ul = ((cell.marchingSquaresCode >> TopLeftCornerIndex) & 1) == 1
      let ur = ((cell.marchingSquaresCode >> TopRightCornerIndex) & 1) == 1
      let br = ((cell.marchingSquaresCode >> BottomRightCornerIndex) & 1) == 1
      let bl = ((cell.marchingSquaresCode >> BottomLeftCornerIndex) & 1) == 1

      let cellOffset = cell.boundaryCellIndex * EdgesPerCell

      if (bl != br) {
        let r = LineSearch(
          lineIntersection,
          cell.center[0] + corners[BottomLeftCornerIndex][0],
          cell.center[1] + corners[BottomLeftCornerIndex][1],
          state.cellDistances[cellOffset + BottomLeftCornerIndex],
          cell.center[0] + corners[BottomRightCornerIndex][0],
          cell.center[1] + corners[BottomRightCornerIndex][1],
          state.cellDistances[cellOffset + BottomRightCornerIndex],
          state.params.epsilon,
          state.params.lineSearchMaxSteps
        )
        if (r) {
          state.cellVertexIndices[cellOffset + BottomEdgeIndex] = state.cellVertices.length
          state.cellVertices.push(lineIntersection.slice())
        } else {
          state.cellVertexIndices[cellOffset + BottomEdgeIndex] = -1
        }
      } else {
        state.cellVertexIndices[cellOffset + BottomEdgeIndex] = -1
      }

      if (bl != ul) {
        let r = LineSearch(
          lineIntersection,
          cell.center[0] + corners[BottomLeftCornerIndex][0],
          cell.center[1] + corners[BottomLeftCornerIndex][1],
          state.cellDistances[cellOffset + BottomLeftCornerIndex],
          cell.center[0] + corners[TopLeftCornerIndex][0],
          cell.center[1] + corners[TopLeftCornerIndex][1],
          state.cellDistances[cellOffset + TopLeftCornerIndex],
          state.params.epsilon,
          state.params.lineSearchMaxSteps
        )
        if (r) {
          state.cellVertexIndices[cellOffset + LeftEdgeIndex] = state.cellVertices.length
          state.cellVertices.push(lineIntersection.slice())
        } else {
          state.cellVertexIndices[cellOffset + LeftEdgeIndex] = -1
        }
      } else {
        state.cellVertexIndices[cellOffset + LeftEdgeIndex] = -1
      }
    })

    // cache the values from right and top edges
    {
      state.boundaryCells.forEach((cell, cellIndex) => {
        let cellOffset = cellIndex * EdgesPerCell

        let upperCellIndex = state.edges[cellOffset + TopEdgeIndex]
        let upperVertexIndex = state.cellVertexIndices[upperCellIndex * EdgesPerCell + BottomEdgeIndex]
        state.cellVertexIndices[cellOffset + TopEdgeIndex] = upperVertexIndex

        let rightCellIndex = state.edges[cellOffset + RightEdgeIndex]
        let rightVertexIndex = state.cellVertexIndices[rightCellIndex * EdgesPerCell + LeftEdgeIndex]
        state.cellVertexIndices[cellOffset + RightEdgeIndex] = rightVertexIndex
      })
    }
  }

  function CollectPolyLoops() {
    let cellCount = state.boundaryCells.length
    let cellVisited = new Uint8Array(cellCount)
    state.loops = []
    let loop = []
    let queue = []
    // Populate the queue with all known boundary cells
    {
      state.boundaryCells.forEach((cell, cellIndex) => {
        let edges = MarchingSquaresCodeToEdge[cell.marchingSquaresCode]
        if (!edges) {
          return
        }
        queue.push({
          cellIndex,
          edgeIndex: edges[0][0]
        })
      })
    }

    let step = 0

    while (queue.length) {
      if (step++ > state.params.debugLoopCollectionMaxSteps && state.params.debugLoopCollectionMaxSteps > -1) {
        break;
      }
      let job = queue.pop()
      let cellIndex = job.cellIndex

      let code = state.boundaryCells[cellIndex].marchingSquaresCode
      if (cellVisited[cellIndex] == code) {
        continue;
      }

      let edges = MarchingSquaresCodeToEdge[code]
      // Disambiguate cases 5,10 by collecting the center distance
      if (edges.length > 1) {
        let cell = state.boundaryCells[cellIndex]
        let d = SampleSDF(cell.center[0], cell.center[1])
        if (IsNegative(d)) {
          edges = edges[1]
        } else {
          edges = edges[0]
        }
      }

      const queueLength = queue.length
      for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
        let edgePair = edges[edgeIndex]
        let startEdge = edgePair[0]
        let endEdge = edgePair[1]

        if (endEdge == job.edgeIndex) {
          startEdge = edgePair[1]
          endEdge = edgePair[0]
        }

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
          // Note: put this at the back of the queue so that we don't end up processing it first.
          //       the priority is to continue the contour that got us to this cell
          queue.unshift({
            cellIndex: cellIndex,
            edgeIndex: startEdge
          })
          continue
        }

        // mark the current cell edges as visited
        cellVisited[cellIndex] |= (startMask | endMask)
        let startVertIndex = state.cellVertexIndices[cellIndex * EdgesPerCell + startEdge]
        let endVertIndex = state.cellVertexIndices[cellIndex * EdgesPerCell + endEdge]
        if (startVertIndex < 0 || endVertIndex < 0) {
          continue;
        }

        if (loop.length == 0) {
          loop.push(startVertIndex)
        }

        if (state.params.subdivideWhileCollectingLoops) {
          let start = state.cellVertices[startVertIndex]
          let end = state.cellVertices[endVertIndex]
          SubdivideSegment(start[0], start[1], end[0], end[1], loop, state.params.subdivideWhileCollectingLoopsMaxSubdivisions)
        }

        loop.push(endVertIndex)

        let nextCellIndex = state.edges[cellIndex * 4 + endEdge]
        if (nextCellIndex > -1) {
          queue.push({
            cellIndex: nextCellIndex,
            edgeIndex: EdgePairings[endEdge]
          })
        }
      }

      // finalize the current loop
      if (queueLength == queue.length && loop.length) {
        state.loops.push(loop)
        loop = []
      }
    }

    if (loop.length > 0) {
      state.loops.push(loop)
    }
  }

  if (ctx.reset == undefined) {
    ctx.reset = () => {
      let old = canvas.width
      canvas.width = 0
      canvas.width = old
    }
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
    ctx.lineCap = 'round'
    state.camera.begin()
    ctx.fillStyle = "rgb(11, 11, 11)"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(1, -1)
    ctx.translate(0, -canvas.height)

    ctx.lineWidth = 1.0 / state.camera.state.zoom

    if (state.dirty) {
      FindBoundaryCells()
      if (state.boundaryCells.length) {
        ComputeEdgeNeighbors()
        ComputeVertices()
        CollectPolyLoops()
      } else if (state.loops) {
        state.loops.length = 0
      }
    }

    // Draw all cells
    if (state.params.debugDrawGrid) {
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
    if (state.params.debugDrawBoundaryCells) {
      ctx.fillStyle = "#888"
      state.boundaryCells.forEach(cell => {
        let radius = cell.radius * 0.8
        let diameter = radius * 2.0
        ctx.fillRect(
          (cell.center[0] - radius),
          (cell.center[1] - radius),
          diameter,
          diameter
        )
      })
    }

    // Draw cell corner states
    if (state.boundaryCells.length && state.params.debugDrawNodeCornerState) {
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

    // Draw cell edge states
    if (state.boundaryCells.length && state.params.debugDrawNodeEdgeState) {
      let radius = state.boundaryCells[0].radius
      let edgeVerts = [
        [[-radius, +radius], [+radius, +radius]],
        [[+radius, +radius], [+radius, -radius]],
        [[+radius, -radius], [-radius, -radius]],
        [[-radius, -radius], [-radius, +radius]],
      ]

      state.boundaryCells.forEach((cell, cellIndex) => {
        let edgeOffset = cellIndex * 4
        let padding = 0.85
        for (let edgeIndex = 0; edgeIndex < 4; edgeIndex++) {

          let edge = state.edges[edgeOffset + edgeIndex]
          if (edge === - 1) {
            continue;
          }

          ctx.strokeStyle = '#008b8b'
          ctx.beginPath()
          ctx.lineWidth = 1.0 / state.camera.state.zoom

          ctx.moveTo(
            cell.center[0] + edgeVerts[edgeIndex][0][0] * padding,
            cell.center[1] + edgeVerts[edgeIndex][0][1] * padding
          )
          ctx.lineTo(
            cell.center[0] + edgeVerts[edgeIndex][1][0] * padding,
            cell.center[1] + edgeVerts[edgeIndex][1][1] * padding
          )
          ctx.stroke()
        }
      })
    }

    // Draw boundary cell vertices
    if (state.params.debugDrawLooseEdgeVertices) {
      state.boundaryCells.forEach((cell, cellIndex) => {
        let cellOffset = cellIndex * 4
        for (let edgeIndex = 0; edgeIndex < 4; edgeIndex++) {
          let vertIndex = state.cellVertexIndices[cellOffset + edgeIndex]
          if (vertIndex < 0) {
            continue
          }
          let vert = state.cellVertices[vertIndex]
          ctx.fillStyle = '#36c5f4'
          ctx.beginPath()

          ctx.arc(
            vert[0],
            vert[1],
            4.0 / state.camera.state.zoom,
            0,
            TAU
          )
          ctx.fill()
        }
      })
    }

    // Draw collected polyline loops
    if (state.loops) {
      state.loops.forEach((vertIndices, loopIndex) => {
        let r = ((loopIndex + 1) * 158) % 255
        let g = ((loopIndex + 1) * 2 * 156) % 255
        let b = ((loopIndex + 1) * 3 * 159) % 127
        ctx.strokeStyle = `rgb(${r},${g},${b})`
        ctx.beginPath()
        ctx.lineWidth = Min(4.0, 8.0 / state.camera.state.zoom)
        vertIndices.forEach((vertIndex, i) => {
          if (vertIndex == -1) {
            return;
          }

          let vert = state.cellVertices[vertIndex]
          if (!vert) {
            return
          }

          if (i == 0) {
            ctx.moveTo(vert[0], vert[1])
          } else {
            ctx.lineTo(vert[0], vert[1])
          }
        })
        ctx.stroke()
      })
    }

    // Draw border cell text
    if (state.params.debugDrawCellTextualInfo) {
      // only draw text when the camera is zoomed in
      if (state.camera.state.zoom >= 2.0) {
        state.boundaryCells.forEach((cell, cellIndex) => {
          let code = cell.marchingSquaresCode
          if (code === 0 || code === 0b1111) {
            return
          }

          ctx.save()
          ctx.scale(1, -1)
          ctx.translate(0, -canvas.height)
          ctx.fillStyle = '#ffd1d5'
          ctx.font = `${Min(30, 12 / state.camera.state.zoom)}px Hack, monospace`
          ctx.fillText(
            `${cellIndex}`,
            cell.center[0],
            canvas.height - cell.center[1]
          )
          ctx.fillText(
            `${code.toString(2).padStart(4, '0')}b ${code}`,
            cell.center[0] - cell.radius * 0.5,
            canvas.height - cell.center[1] - cell.radius * 0.5
          )
          ctx.restore()
        })

      }
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