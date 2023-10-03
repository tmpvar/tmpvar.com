import CreateParamReader from "./params.js"
import CreateCamera from "./camera.js"

function SubdividewDual2DBegin(rootEl) {
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
    Param('maxDepth', 'f32', (parentEl, value, oldValue) => {
      parentEl.querySelector('output').innerHTML = `${value}`
      return value
    })

    Param('isolevel', 'f32', (parentEl, value, oldValue) => {
      parentEl.querySelector('output').innerHTML = `${value}`
      return value
    })
  }

  function SubdivideSquare(cx, cy, radius, remainingSteps) {
    if (remainingSteps == 0) {
      return
    }
    ctx.strokeStyle = "#444"
    let padding = radius / remainingSteps
    let diameter = radius * 2.0
    ctx.strokeRect(
      (cx - radius),
      (cy - radius),
      diameter,
      diameter)

    let d = SampleSDF(cx, cy)

    if (Math.abs(d) <= radius * 1.5) {
      if (remainingSteps == 1) {
        ctx.fillStyle = "#9de64e"
        ctx.fillRect(
          (cx - radius),
          (cy - radius),
          diameter,
          diameter
        )
      }
      let nextRadius = radius * 0.5
      SubdivideSquare(cx - nextRadius, cy - nextRadius, nextRadius, remainingSteps - 1)
      SubdivideSquare(cx + nextRadius, cy - nextRadius, nextRadius, remainingSteps - 1)
      SubdivideSquare(cx - nextRadius, cy + nextRadius, nextRadius, remainingSteps - 1)
      SubdivideSquare(cx + nextRadius, cy + nextRadius, nextRadius, remainingSteps - 1)
    }
  }

  function RenderFrame() {
    ReadParams()
    if (!state.dirty && !state.camera.state.dirty) {
      requestAnimationFrame(RenderFrame)
      return
    }
    state.dirty = false

    ctx.reset()
    state.camera.begin()
    ctx.scale(1, -1)
    ctx.translate(0, -canvas.height)

    let radius = canvas.width / 2
    SubdivideSquare(radius, radius, radius, state.params.maxDepth)


    state.camera.end()
    requestAnimationFrame(RenderFrame)
  }
  requestAnimationFrame(RenderFrame)
}


SubdividewDual2DBegin(
  document.querySelector('#subdivide-dual-2d-content')
)