+++
title = "Radiance Cascades (2D)"
date = 2020-04-01
+++

Trying to build up my intuition around Suslik's [Radiance Cascades](https://drive.google.com/file/d/1L6v1_7HY2X-LV3Ofb6oyTIxgEaP4LOI6/view?usp=sharing) GI approach.

## Radiance Intervals

In 2D these are bands of radiance values where each cascade doubles the inner radius of the band and the width of the band.

<p>
level: <input type="range" min="0" max="5" value="1" id="radiance-cascades-2d-canvas-level-slider">
</p>

<p>
color lower levels: <input type="checkbox" value="1" id="radiance-cascades-2d-canvas-color-lower-levels">
</p>

<section class="center-align">
  <canvas id="radiance-cascades-2d-canvas" width="1024" height="1024"></canvas>
</section>

<script>
  // Setup
  let canvas = document.getElementById('radiance-cascades-2d-canvas');
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

    let levelSlider = Number(document.getElementById('radiance-cascades-2d-canvas-level-slider').value)
    let colorLowerLevels = !!document.getElementById('radiance-cascades-2d-canvas-color-lower-levels').checked
    let levelColors = ([
      '#f3a833',
      '#9de64e',
      '#36c5f4',
      '#ffa2ac',
      '#cc99ff',
      '#a6cb96',
      '#de5d3a'
    ]).map((v,i) => {
      return (i == levelSlider || (i < levelSlider && colorLowerLevels)) ? v : '#222'
    });

    // Draw the actual cascades
    let levels = 6;
    let baseSize = 32;
    let baseAngularSteps = 4
    let TAU = Math.PI * 2.0
    let angleOffset = Math.PI * 0.25

    let radianceIntervalStart = 0;

    for (let level=0; level<=levelSlider; level++) {
      let size = baseSize << level
      let angularSteps = baseAngularSteps << level
      let stepAngle = TAU / angularSteps
      let radius = size / 2.0

      state.ctx.strokeStyle = levelColors[level]
      state.ctx.fillStyle = '#f0f'
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
          }
          state.ctx.stroke();
        }
      }
      radianceIntervalStart = radius;
    }


    window.requestAnimationFrame(DrawRadianceCascades2D)
  }
  window.requestAnimationFrame(DrawRadianceCascades2D)


</script>