function ProbeRayDistributions2DBegin(rootEl) {
  // Setup
  let canvas = rootEl.querySelector('canvas');
  let state = {
    canvas: canvas,
    ctx: canvas.getContext('2d'),
    params: {
      levelSlider: -1,
      colorLowerLevels: -1,
      showCascadeRayCounts: -1,
      i: 4,
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

  const DrawRayDistributions2D = () => {
    window.requestAnimationFrame(DrawRayDistributions2D)

    let controlEl = document.getElementById('ray-distributions-2d-controls')

    // html sliders/checkboxes
    let dirty = false;
    dirty = dirty || Param(
      'levelSlider',
      parseFloat(controlEl.querySelector('input[name="level-slider"]').value)
    )

    dirty = dirty || Param(
      'i',
      parseFloat(controlEl.querySelector('input[name="i-slider"]').value)
    )

    dirty = dirty || Param(
      'branchingFactor',
      parseFloat(controlEl.querySelector('input[name="level-branching-factor"]').value)
    )

    dirty = dirty || Param(
      'colorLowerLevels',
      !!controlEl.querySelector('input[name="color-lower-levels"]').checked
    )

    dirty = dirty || Param(
      'showCascadeRayCounts',
      !!controlEl.querySelector('input[name="show-cascade-ray-counts"]').checked
    )

    console.log(state.params)
    if (!dirty) {
      return;
    }

    // clear the canvas
    state.ctx.fillStyle = '#111';
    state.ctx.fillRect(0, 0, canvas.width, canvas.height);

    let levelColors = ([
      '#f3a833',
      '#9de64e',
      '#36c5f4',
      '#ffa2ac',
      '#cc99ff',
      '#ec273f',
      '#de5d3a'
    ]).map((v, i) => {
      if (i == state.params.levelSlider || (i < state.params.levelSlider && state.params.colorLowerLevels)) {
        return v
      } else {
        return '#222'
      }
    });

    // Draw the actual cascades
    let levels = 6;
    let i = state.params.i;
    let startingProbeRadius = Math.pow(2, i);
    let baseAngularSteps = Math.max(4, Math.pow(2, i));
    let TAU = Math.PI * 2.0
    state.ctx.save()
    let scale = 4.0;
    state.ctx.scale(scale, scale);
    state.ctx.lineWidth = 1.0 / scale * 2.0;
    let radianceIntervalStart = 0;
    let cascadeRayCounts = [];
    for (let level = 0; level <= state.params.levelSlider; level++) {
      let angularSteps = baseAngularSteps << (level * state.params.branchingFactor)
      let radius = startingProbeRadius << (level * state.params.branchingFactor)
      let diameter = radius * 2
      let prevRadius = level > 0
        ? startingProbeRadius << ((level - 1) * state.params.branchingFactor)
        : 0;

      state.ctx.strokeStyle = levelColors[level]
      state.ctx.fillStyle = '#f0f'
      let cascadeRayCount = 0;
      for (let x = 0; x < state.canvas.width; x += diameter) {
        for (let y = 0; y < state.canvas.height; y += diameter) {
          state.ctx.beginPath()
          let centerX = x + radius
          let centerY = y + radius
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
      cascadeRayCounts.push(cascadeRayCount);
      radianceIntervalStart = radius;
    }
    state.ctx.restore()
    if (state.params.showCascadeRayCounts) {
      let totalRays = 0;
      state.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
      state.ctx.fillRect(0, 0, 230, 20 + 30 * (cascadeRayCounts.length + 1))
      state.ctx.fillStyle = 'white'
      state.ctx.font = '20px monospace'
      cascadeRayCounts.forEach((count, level) => {
        state.ctx.fillText(`level:${level} rays:${count}`, 20, 30 + level * 30)
        totalRays += count;
      })

      state.ctx.fillText(`total rays:${totalRays}`, 20, 30 + cascadeRayCounts.length * 30)
    }
  }

  DrawRayDistributions2D()
}

ProbeRayDistributions2DBegin(
  document.querySelector('#ray-distributions-2d-content')
)