+++
title = "Radiance Cascades (2D)"
date = 2020-04-01
+++

Trying to build up my intuition around Suslik's Radiance Cascades GI approach.
- [paper](https://drive.google.com/file/d/1L6v1_7HY2X-LV3Ofb6oyTIxgEaP4LOI6/view?usp=sharing)
- [demo](https://www.youtube.com/watch?v=xkJ6i2N32Pc)
- [Exilecon talk](https://www.youtube.com/watch?v=B-ODrtmtpzM)


## Radiance Intervals
In 2D these are bands of radiance values where each cascade doubles the inner radius of the band and the width of the band. The radiance values are calculated 2x the number of rays per cascade. Per the paper, the current cascade has 2x the number of probe rays and 1/2 the total rays when compared to the previous level (e.g., 1024 total rays on level 0 means 512 total rays on level 1)

### Ray Distributions
<p>
level: <input type="range" min="0" max="5" value="1" id="ray-distributions-2d-canvas-level-slider">
</p>

<p>
level 0 ray count: <input type="range" min="1" max="32" value="4" id="ray-distributions-2d-canvas-level-0-ray-count">
</p>

<p>
color lower levels: <input type="checkbox" value="1" id="ray-distributions-2d-canvas-color-lower-levels">
</p>
<p>
show cascade ray counts: <input type="checkbox" value="1" id="ray-distributions-2d-canvas-show-cascade-ray-counts">
</p>

<section class="center-align">
  <canvas id="ray-distributions-2d-canvas" width="1024" height="1024"></canvas>
</section>

<script>
  // Setup
  let canvas = document.getElementById('ray-distributions-2d-canvas');
  let state = {
    mouse: [0, 0],
    canvas: canvas,
    ctx: canvas.getContext('2d')
  }

  window.radianceCascades2dState = state;

  function CanvasClear() {
    state.ctx.fillStyle = '#111';
    state.ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function CanvasDrawMouse() {
    state.ctx.fillStyle = 'red'
    state.ctx.fillRect(state.mouse[0] - 10, state.mouse[1] - 10, 20, 20)
  }

  function CanvasGetLocalPos(x, y) {
    let rect = state.canvas.getBoundingClientRect()
    return [x - rect.x, y - rect.y]
  }

  canvas.addEventListener("mousemove", e => {
    state.mouse = CanvasGetLocalPos(e.clientX, e.clientY)
  });

  function DrawRadianceCascades2D() {
    CanvasClear();
    // CanvasDrawMouse();

    let levelSlider = Number(document.getElementById('ray-distributions-2d-canvas-level-slider').value)
    let level0RayCountSlider = Number(document.getElementById('ray-distributions-2d-canvas-level-0-ray-count').value)
    let colorLowerLevels = !!document.getElementById('ray-distributions-2d-canvas-color-lower-levels').checked
    let showCascadeRayCounts = !!document.getElementById('ray-distributions-2d-canvas-show-cascade-ray-counts').checked

    let levelColors = ([
      '#f3a833',
      '#9de64e',
      '#36c5f4',
      '#ffa2ac',
      '#cc99ff',
      '#ec273f',
      '#de5d3a'
    ]).map((v,i) => {
      return (i == levelSlider || (i < levelSlider && colorLowerLevels)) ? v : '#222'
    });

    // Draw the actual cascades
    let levels = 6;
    let baseSize = 32;
    let baseAngularSteps = level0RayCountSlider
    let TAU = Math.PI * 2.0
    let angleOffset = Math.PI * 0.25

    let radianceIntervalStart = 0;
    let cascadeRayCounts = [];
    for (let level=0; level<=levelSlider; level++) {
      let size = baseSize << level
      let angularSteps = baseAngularSteps << level
      let stepAngle = TAU / angularSteps
      let radius = size / 2.0

      state.ctx.strokeStyle = levelColors[level]
      state.ctx.fillStyle = '#f0f'
      let cascadeRayCount = 0;
      for (let x = 0; x<state.canvas.width; x+=size) {
        for (let y = 0; y<state.canvas.height; y+=size) {

          // state.ctx.fillRect(x+1, y+1, size-2, size-2);
          state.ctx.beginPath()
          let centerX = x + radius
          let centerY = y + radius
          for (let step = 0; step<angularSteps; step++) {
            let angle = angleOffset + step * stepAngle;
            // console.log(angle)

            let dirX = Math.sin(angle)
            let dirY = Math.cos(angle)

            state.ctx.moveTo(centerX + dirX * radianceIntervalStart, centerY + dirY * radianceIntervalStart);
            state.ctx.lineTo(centerX + dirX * radius, centerY + dirY * radius)
            cascadeRayCount++;
          }
          state.ctx.stroke();
        }
      }
      cascadeRayCounts.push(cascadeRayCount);
      radianceIntervalStart = radius;
    }

    if (showCascadeRayCounts) {
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
    window.requestAnimationFrame(DrawRadianceCascades2D)
  }

  DrawRadianceCascades2D()
</script>