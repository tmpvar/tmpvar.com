import CreateParamReader from "./params.js"
import CreateCamera from "./camera.js"

function SubdividewDual2DBegin(rootEl) {
  const TAU = Math.PI * 2
  let controlEl = rootEl.querySelector('.controls')
  let canvas = rootEl.querySelector('canvas')
  let ctx = canvas.getContext('2d')
  const state = {
    params: {},
    dirty: true,
    camera: CreateCamera(ctx),
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

  const Param = CreateParamReader(state, controlEl)
  function ReadParams() {
    Param('debugDrawNodeIndex', 'bool')
    Param('debugDrawNodeCornerState', 'bool')
    Param('debugDrawDualGraph', 'bool')

    Param('maxDepth', 'f32', (parentEl, value, oldValue) => {
      parentEl.querySelector('output').innerHTML = `${value}`
      return value
    })
    Param('isolevel', 'f32', (parentEl, value, oldValue) => {
      parentEl.querySelector('output').innerHTML = `${value}`
      return value
    })

    Param('maxExtractionSteps', 'i32', (parentEl, value, oldValue) => {
      parentEl.querySelector('output').innerHTML = `${value}`
      return value
    })

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
        }
        node.children[i] = childNodeIndex
      })
      return nodeIndex
    }

    return nodeIndex
  }

  function HorizontalProc(nodes, edges, leftNodeIndex, rightNodeIndex) {
    if (leftNodeIndex == -1 || rightNodeIndex == -1) {
      return
    }

    let leftNode = nodes[leftNodeIndex]
    let rightNode = nodes[rightNodeIndex]

    if (rightNode.mask === 0 && leftNode.mask === 0) {
      edges.push([leftNodeIndex, rightNodeIndex])
      edges.push([rightNodeIndex, leftNodeIndex])
      return
    }

    // left is a leaf
    if (leftNode.mask === 0) {
      HorizontalProc(nodes, edges, leftNodeIndex, rightNode.children[0]);
      HorizontalProc(nodes, edges, leftNodeIndex, rightNode.children[2]);
      return;
    }

    // right is a leaf
    if (rightNode.mask === 0) {
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

    if (upperNode.mask === 0 && lowerNode.mask === 0) {
      edges.push([upperNodeIndex, lowerNodeIndex])
      edges.push([lowerNodeIndex, upperNodeIndex])
      return
    }

    // upper is a leaf
    if (upperNode.mask === 0) {
      VerticalProc(nodes, edges, upperNodeIndex, lowerNode.children[2]);
      VerticalProc(nodes, edges, upperNodeIndex, lowerNode.children[3]);
      return
    }

    // lower is a leaf
    if (lowerNode.mask == 0) {
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

  function RenderFrame() {
    ReadParams()
    if (!state.dirty && !state.camera.dirty) {
      requestAnimationFrame(RenderFrame)
      return
    }
    state.dirty = false

    ctx.reset()
    state.camera.begin()
    ctx.fillStyle = "rgb(11, 11, 11)"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(1, -1)
    ctx.translate(0, -canvas.height)

    ctx.lineWidth = 1.0 / state.camera.state.zoom
    let radius = canvas.width / 2
    let nodes = []
    SubdivideSquare(nodes, radius, radius, radius, state.params.maxDepth)

    let edges = []
    FaceProc(nodes, edges, 0)

    let nodeToNodeMapping = {}
    let visitedNodes = {}

    function DirToIndex(dx, dy) {
      // what index does dx/dy map to?
      //     2
      //    +-+
      //  3 | | 1
      //    +-+
      //     0
      if (dx != 0 && dy != 0) {
        throw new Error('self reference')
      }

      if (dy < 0) {
        return 0
      }
      if (dy > 0) {
        return 1
      }
      if (dx > 0) {
        return 2
      }
      if (dx < 0) {
        return 3
      }
    }

    function AddNodeToNodeMapping(fromIndex, toIndex, dx, dy) {
      let outputIndex = DirToIndex(dx, dy)
      if (!nodeToNodeMapping[fromIndex]) {
        nodeToNodeMapping[fromIndex] = [-1, -1, -1, -1]
      }

      nodeToNodeMapping[fromIndex][outputIndex] = toIndex
    }

    edges.forEach(edge => {
      let nodeA = nodes[edge[0]]
      let nodeB = nodes[edge[1]]

      if (nodeA.containsContour && nodeB.containsContour) {
        {
          let dx = Math.sign(nodeA.center[0] - nodeB.center[0])
          let dy = Math.sign(nodeA.center[1] - nodeB.center[1])
          AddNodeToNodeMapping(edge[0], edge[1], dx, dy)
        }

        {
          let dx = nodeB.center[0] - nodeA.center[0]
          let dy = nodeB.center[1] - nodeA.center[1]
          AddNodeToNodeMapping(edge[1], edge[0], dx, dy)
        }
      }
    })

    ctx.save()
    nodes.forEach(node => {
      if (!node.containsContour) {
        return
      }

      ctx.fillStyle = '#006554'
      ctx.fillRect(
        node.center[0] - node.radius * 0.95,
        node.center[1] - node.radius * 0.95,
        node.radius * 2.0 * 0.9,
        node.radius * 2.0 * 0.9
      )

      let samplePoints = [
        [node.center[0] - node.radius, node.center[1] - node.radius],
        [node.center[0] + node.radius, node.center[1] - node.radius],
        [node.center[0] - node.radius, node.center[1] + node.radius],
        [node.center[0] + node.radius, node.center[1] + node.radius],
      ]


      if (state.params.debugDrawNodeCornerState) {
        samplePoints.forEach(point => {
          let d = SampleSDF(point[0], point[1])
          ctx.fillStyle = (d <= 0) ? '#0f0' : '#f00'
          ctx.beginPath()
          ctx.arc(point[0], point[1], Math.min(2.0, 4.0 / state.camera.state.zoom), 0, TAU)
          ctx.fill()
        })
      }

      if (state.params.debugDrawNodeIndex && state.camera.state.zoom > 4.0) {
        ctx.save()
        ctx.scale(1, -1)
        ctx.translate(0, -canvas.height)
        ctx.font = `${12 / Math.max(1.0, state.camera.state.zoom)}px Hack, monospace`
        ctx.fillStyle = 'white'
        ctx.fillText(`idx:${node.index}`, node.center[0] - node.radius * .95, canvas.height - (node.center[1] + node.radius * 0.5))
        ctx.restore()
      }
    })

    let step = 0
    nodes.forEach(node => {
      console.log(step, state.params.maxExtractionSteps)
      if (step > state.params.maxExtractionSteps) {
        return
      }

      if (visitedNodes[node.index]) {
        return
      }
      visitedNodes[node.index] = true
      if (!node.containsContour) {
        return
      }

      // walk the edge
      {
        let indexName = ['down', 'right', 'up', 'left']

        let nextNode = node
        let dirIndex = 0

        console.group('walk edge')
        while (nextNode && step < state.params.maxExtractionSteps) {
          console.log(step, state.params.maxExtractionSteps)
          ctx.strokeStyle = "#9de64e"
          ctx.lineWidth = 5.0 / state.camera.state.zoom

          let nextNodeIndex = nextNode.index
          node = nextNode
          nextNode = null

          for (let i = 3; i >= 0; i--) {
            let index = Math.abs((i + dirIndex) % 4)
            let otherNodeIndex = nodeToNodeMapping[nextNodeIndex][index]

            if (otherNodeIndex == -1) {
              continue
            }

            let otherNode = nodes[otherNodeIndex]

            if (otherNode.containsContour && !visitedNodes[otherNodeIndex]) {
              visitedNodes[otherNodeIndex] = true
              ctx.beginPath()
              ctx.moveTo(node.center[0], node.center[1])
              ctx.lineTo(otherNode.center[0], otherNode.center[1])
              ctx.stroke()

              nextNode = otherNode
              switch (i) {
                case 0: dirIndex = 1; break;
                case 1: dirIndex = 2; break;
                case 2: dirIndex = 3; break;
                case 3: dirIndex = 0; break;
              }

              break
            }
          }
          step++;
        }
        console.groupEnd('walk edge')
      }

    })
    ctx.restore()

    if (state.params.debugDrawDualGraph) {
      ctx.strokeStyle = "#3388de"
      ctx.beginPath()
      edges.forEach(edge => {
        let a = nodes[edge[0]]
        let b = nodes[edge[1]]

        ctx.moveTo(a.center[0], a.center[1])
        ctx.lineTo(b.center[0], b.center[1])
      })
      ctx.stroke()
    }

    state.camera.end()
    requestAnimationFrame(RenderFrame)
  }
  requestAnimationFrame(RenderFrame)
}


SubdividewDual2DBegin(
  document.querySelector('#subdivide-dual-2d-content')
)