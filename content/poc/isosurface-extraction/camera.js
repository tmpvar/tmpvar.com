
export default function CreateCamera(ctx) {
  var limits = {
    zoom: [1, 100]
  }

  var mouse = {
    down: false,
    pos: [0, 0],
    deltaPos: [0, 0],
    downPosition: [0, 0]
  }

  let canvas = ctx.canvas
  var frameSize = [
    canvas.innerWidth,
    canvas.innerHeight
  ]

  let state = {
    translation: [0, 0],
    zoom: 1
  }

  var camera = {
    begin: begin,
    end: end,
    translate: translateCamera,
    zoom: zoomCamera,
    mouse: mouse,
    zoomToScreenPoint: zoomToScreenPoint,
    dirty: false,
    state: state
  }

  function begin() {
    camera.dirty = false
    ctx.save()
    ctx.scale(state.zoom, state.zoom)
    ctx.translate(state.translation[0], state.translation[1])
  }

  function end() {
    ctx.restore()
    return state
  }

  function translateCamera(x, y) {
    state.translation[0] += x
    state.translation[1] += y
    camera.dirty = true
  }

  function zoomCamera(amount) {
    state.zoom = Math.max(limits.zoom[0], Math.min(limits.zoom[1], state.zoom + amount))
    camera.dirty = true
  }

  function zoomToScreenPoint(x, y, amount) {
    var ox = x / state.zoom
    var oy = y / state.zoom

    zoomCamera(amount)

    var nx = x / state.zoom
    var ny = y / state.zoom

    translateCamera(nx - ox, ny - oy)
  }


  function MoveMouse(x, y) {
    let ratioX = canvas.width / canvas.clientWidth
    let ratioY = canvas.height / canvas.clientHeight
    let newX = x * ratioX
    let newY = y * ratioY

    mouse.deltaPos[0] = newX - mouse.pos[0]
    mouse.deltaPos[1] = newY - mouse.pos[1]

    mouse.pos[0] = newX
    mouse.pos[1] = newY

    state.dirty = true;
  }

  canvas.addEventListener('mousedown', handleMouseDown)
  canvas.addEventListener('mouseup', handleMouseUp)
  canvas.addEventListener('mousemove', handleMouseMove)
  canvas.addEventListener('wheel', handleMouseWheel, { passive: false })
  canvas.addEventListener('resize', handleResize)

  function handleMouseDown(e) {
    MoveMouse(e.offsetX, e.offsetY)
    mouse.down = true
    mouse.downPosition[0] = mouse.pos[0]
    mouse.downPosition[0] = mouse.pos[1]
  }

  function handleMouseUp(e) {
    mouse.down = false
  }

  function handleMouseMove(e) {
    MoveMouse(e.offsetX, e.offsetY)
    if (mouse.down) {
      translateCamera(
        mouse.deltaPos[0] / state.zoom,
        mouse.deltaPos[1] / state.zoom
      )
    }
  }

  function handleMouseWheel(e) {
    var delta = -e.deltaY / 1000
    zoomToScreenPoint(mouse.pos[0], mouse.pos[1], delta)
    e.preventDefault()
  }

  function handleResize(e) {
    frameSize[0] = eventContext.innerWidth
    frameSize[1] = eventContext.innerHeight
  }

  return camera
}