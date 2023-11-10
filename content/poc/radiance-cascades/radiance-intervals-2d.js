RadianceIntervals2DBegin(
  document.getElementById('radiance-intervals-2d-content')
)

function RadianceIntervals2DBegin(rootEl) {
  // Setup
  let controlEl = rootEl.querySelector('.controls')
  let canvas = rootEl.querySelector('canvas')
  let state = {
    canvas: canvas,
    ctx: canvas.getContext('2d'),
    params: {
      levelSlider: -1,
      level0RayCountSlider: -1,
      colorLowerLevels: -1,
      showCascadeRayCounts: -1,
    }
  }

  const Param = (name, value) => {
    if (state.params[name] != value) {
      state.params[name] = value;
      return true;
    }
    return false;
  }

  // clear the canvas
  state.ctx.fillStyle = '#111';
  state.ctx.fillRect(0, 0, canvas.width, canvas.height);
  let levelCount = 6;
  let levelColors = [
    '#f3a833',
    '#9de64e',
    '#36c5f4',
    '#ffa2ac',
    '#cc99ff',
    '#ec273f',
    '#de5d3a'
  ]

  function DrawRadianceIntervals() {
    window.requestAnimationFrame(DrawRadianceIntervals)
    let dirty = false;


    dirty = dirty || Param(
      'level0RayCountSlider',
      parseFloat(controlEl.querySelector('input[name="level-0-ray-count"]').value)
    )
    dirty = dirty || Param(
      'branchingFactor',
      parseFloat(controlEl.querySelector('input[name="branching-factor"]').value)
    )

    if (!dirty) {
      return
    }

    // clear the canvas
    state.ctx.fillStyle = '#111';
    state.ctx.fillRect(0, 0, canvas.width, canvas.height);
    state.ctx.lineWidth = 2;

    let centerX = Math.floor(state.canvas.width / 2.0)
    let centerY = Math.floor(state.canvas.height / 2.0)
    let startingProbeRadius = 16
    let levelPadding = 0
    // the number of rays cast at level 0
    let baseAngularSteps = state.params.level0RayCountSlider;
    let TAU = Math.PI * 2.0
    let angleOffset = Math.PI * 0.25

    for (var level = 0; level <= levelCount; level++) {
      state.ctx.strokeStyle = levelColors[level];

      let radius = (startingProbeRadius << (level * state.params.branchingFactor)) - levelPadding;
      let prevRadius = level > 0
        ? (startingProbeRadius << ((level - 1) * state.params.branchingFactor)) - levelPadding
        : 0;

      if (prevRadius * 2.0 > canvas.width) {
        break
      }

      state.ctx.beginPath()
      state.ctx.moveTo(centerX + radius, centerY)
      state.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2.0)
      state.ctx.stroke();

      let angularSteps = baseAngularSteps << (level * state.params.branchingFactor)
      state.ctx.beginPath()
      for (let step = 0; step < angularSteps; step++) {
        let angle = TAU * (step + 0.5) / angularSteps;

        state.ctx.moveTo(centerX + Math.sin(angle) * prevRadius, centerY + Math.cos(angle) * prevRadius)
        state.ctx.lineTo(centerX + Math.sin(angle) * radius, centerY + Math.cos(angle) * radius)
      }
      state.ctx.stroke();
    }
  }
  DrawRadianceIntervals()
}
