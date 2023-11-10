ProbeInterpolation2DBegin(
  document.getElementById('probe-interpolation-2d-content')
)

function ProbeInterpolation2DBegin(rootEl) {
  // Setup
  let canvas = rootEl.querySelector('canvas');
  let controlEl = rootEl.querySelector('.controls');
  let state = {
    canvas: canvas,
    ctx: canvas.getContext('2d'),
    params: {
      minLevel: 0,
      maxLevel: 6,
      level0RayCountSlider: 0,
    }
  }

  state.ctx.lineWidth = 2;

  const Param = (name, value) => {
    if (state.params[name] != value) {
      state.params[name] = value;
      return true;
    }
    return false;
  }

  function DrawRayDistributions2D() {
    window.requestAnimationFrame(DrawRayDistributions2D)

    // html sliders/checkboxes
    let dirty = false;
    dirty = dirty || Param(
      'minLevel',
      parseFloat(controlEl.querySelector('input[name="minLevel-slider"]').value)
    )
    dirty = dirty || Param(
      'maxLevel',
      parseFloat(controlEl.querySelector('input[name="maxLevel-slider"]').value)
    )

    dirty = dirty || Param(
      'branchingFactor',
      parseFloat(controlEl.querySelector('input[name="level-branching-factor"]').value)
    )

    dirty = dirty || Param(
      'level0RayCountSlider',
      parseFloat(controlEl.querySelector('input[name="level-0-ray-count"]').value)
    )

    if (!dirty) {
      return;
    }

    // clear the canvas
    state.ctx.fillStyle = '#111';
    state.ctx.fillRect(0, 0, canvas.width, canvas.height);

    let levelColors = [
      '#f3a833',
      '#9de64e',
      '#36c5f4',
      '#ffa2ac',
      '#cc99ff',
      '#ec273f',
      '#de5d3a'
    ]

    // Draw the actual cascades
    let levels = 6;
    let startingProbeRadius = 64;
    let baseAngularSteps = state.params.level0RayCountSlider
    let TAU = Math.PI * 2.0

    let radianceIntervalStart = 0;
    let cascadeRayCounts = [];
    let diameter = startingProbeRadius * 2
    let levelPadding = 0
    for (let level = state.params.minLevel; level <= state.params.maxLevel; level++) {
      let angularSteps = baseAngularSteps << (level * state.params.branchingFactor)
      let radius = (startingProbeRadius << (level * state.params.branchingFactor)) - levelPadding
      let prevRadius = level > 0
        ? (startingProbeRadius << ((level - 1) * state.params.branchingFactor)) - levelPadding
        : 0;

      state.ctx.strokeStyle = levelColors[level]
      state.ctx.fillStyle = '#f0f'
      let cascadeRayCount = 0;
      for (let x = 0; x < state.canvas.width; x += diameter) {
        for (let y = 0; y < state.canvas.height; y += diameter) {
          state.ctx.beginPath()
          let centerX = x + startingProbeRadius
          let centerY = y + startingProbeRadius
          for (let step = 0; step < angularSteps; step++) {
            let angle = TAU * (step + 0.5) / angularSteps;
            let dirX = Math.sin(angle)
            let dirY = Math.cos(angle)

            state.ctx.moveTo(centerX + dirX * prevRadius, centerY + dirY * prevRadius);

            state.ctx.lineTo(centerX + dirX * radius, centerY + dirY * radius)
            cascadeRayCount++;
          }
          state.ctx.stroke();
        }
      }
    }
  }

  DrawRayDistributions2D()
}