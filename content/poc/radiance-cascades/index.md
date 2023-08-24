+++
title = "Radiance Cascades"
date = 2020-04-01
+++

Trying to build up my intuition around Suslik's Radiance Cascades GI approach.
- [paper](https://drive.google.com/file/d/1L6v1_7HY2X-LV3Ofb6oyTIxgEaP4LOI6/view?usp=sharing)
- [demo](https://www.youtube.com/watch?v=xkJ6i2N32Pc)
- [Exilecon talk](https://www.youtube.com/watch?v=B-ODrtmtpzM)


## Radiance Intervals
In 2D these are bands/shells/annuluses/crusts(🍕) of radiance values where relative to the previous level, each cascade level:
- doubles the inner radius of the band
- doubles the width of the band
- doubles the number of rays per probe
- halves the total number of rays

<p>
level 0 ray count: <input type="range" min="1" max="32" value="4" id="radiance-intervals-2d-canvas-level-0-ray-count">
</p>

<section class="center-align">
  <canvas id="radiance-intervals-2d-canvas" width="1024" height="1024"></canvas>
</section>

<script>
  // tuck this into a scope so we can have multiple interactive context2ds on this page
  {
    // Setup
    let canvas = document.getElementById('radiance-intervals-2d-canvas');
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

    function Param(name, value) {
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
        parseFloat(document.getElementById('radiance-intervals-2d-canvas-level-0-ray-count').value)
      )


      if (!dirty) {
        return
      }

      // clear the canvas
      state.ctx.fillStyle = '#111';
      state.ctx.fillRect(0, 0, canvas.width, canvas.height);

      let centerX = Math.floor(state.canvas.width / 2.0)
      let centerY = Math.floor(state.canvas.height / 2.0)
      let startingProbeRadius = 32
      let levelPadding = 10
      // the number of rays cast at level 0
      let baseAngularSteps = state.params.level0RayCountSlider;
      let TAU = Math.PI * 2.0
      let angleOffset = Math.PI * 0.25

      for (var level=0; level < levelCount; level++) {
        state.ctx.strokeStyle = levelColors[level];
        let radius = (startingProbeRadius << level) - levelPadding;
        let prevRadius = level > 0 ? (startingProbeRadius << (level - 1)) - levelPadding : 0;

        state.ctx.beginPath()
        state.ctx.moveTo(centerX + radius, centerY)
        state.ctx.arc(centerX, centerY, radius, 0, Math.PI*2.0)
        state.ctx.stroke();

        let angularSteps = baseAngularSteps << level
        let stepAngle = TAU / angularSteps
        state.ctx.beginPath()
        for (let step = 0; step<angularSteps; step++) {
          let angle = angleOffset + step * stepAngle;

          state.ctx.moveTo(centerX + Math.sin(angle) * prevRadius, centerY + Math.cos(angle) * prevRadius)
          state.ctx.lineTo(centerX + Math.sin(angle) * radius, centerY + Math.cos(angle) * radius)
        }
        state.ctx.stroke();
      }

    }

    DrawRadianceIntervals()

  }
</script>

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
  // tuck this into a scope so we can have multiple interactive context2ds on this page
  {
    // Setup
    let canvas = document.getElementById('ray-distributions-2d-canvas');
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

    window.demoRayDistributions = state;

    function Param(name, value) {
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
        'levelSlider',
        parseFloat(document.getElementById('ray-distributions-2d-canvas-level-slider').value)
      )

      dirty = dirty || Param(
        'level0RayCountSlider',
        parseFloat(document.getElementById('ray-distributions-2d-canvas-level-0-ray-count').value)
      )

      dirty = dirty || Param(
        'colorLowerLevels',
        !!document.getElementById('ray-distributions-2d-canvas-color-lower-levels').checked
      )

      dirty = dirty || Param(
        'showCascadeRayCounts',
        !!document.getElementById('ray-distributions-2d-canvas-show-cascade-ray-counts').checked
      )

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
      ]).map((v,i) => {
        if (i == state.params.levelSlider || (i < state.params.levelSlider && state.params.colorLowerLevels)) {
          return v
        } else {
          return '#222'
        }
      });

      // Draw the actual cascades
      let levels = 6;
      let baseSize = 16;
      let baseAngularSteps = state.params.level0RayCountSlider
      let TAU = Math.PI * 2.0
      let angleOffset = Math.PI * 0.25

      let radianceIntervalStart = 0;
      let cascadeRayCounts = [];
      for (let level=0; level<=state.params.levelSlider; level++) {
        let size = baseSize << level
        let angularSteps = baseAngularSteps << level
        let stepAngle = TAU / angularSteps
        let radius = size / 2.0

        state.ctx.strokeStyle = levelColors[level]
        state.ctx.fillStyle = '#f0f'
        let cascadeRayCount = 0;
        for (let x = 0; x<state.canvas.width; x+=size) {
          for (let y = 0; y<state.canvas.height; y+=size) {
            state.ctx.beginPath()
            let centerX = x + radius
            let centerY = y + radius
            for (let step = 0; step<angularSteps; step++) {
              let angle = angleOffset + step * stepAngle;
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
</script>

## Probe Storage (2D)

Visualize the radiance intervals that have a light in their bounds by drawing the quantized angle to the light

click/drag to move the light

<section class="center-align">
  <canvas id="probe-storage-2d-canvas" width="1024" height="1024"></canvas>
</section>


<script>
  // tuck this into a scope so we can have multiple interactive context2ds on this page
  {
    // Setup
    let canvas = document.getElementById('probe-storage-2d-canvas');
    let state = {
      canvas: canvas,
      ctx: canvas.getContext('2d'),
      params: {
        levelSlider: -1,
        level0RayCountSlider: -1,
        colorLowerLevels: -1,
        showCascadeRayCounts: -1,
      },
      lightPos: [0, 0],
      positionedWithMouse: false,
      mouseIsDown: false,
      lastMouseDown: [0, 0]
    }

    function Param(name, value) {
      if (state.params[name] != value) {
        state.params[name] = value;
        return true;
      }
      return false;
    }

    function MoveLight(e) {
      let rect = canvas.getBoundingClientRect()
      state.lightPos[0] = e.clientX - rect.x
      state.lightPos[1] = e.clientY - rect.y
      state.positionedWithMouse = true
    }

    window.addEventListener("mouseup", e => {
      state.mouseIsDown = false
    })

    canvas.addEventListener("mousedown", (e) => {

      state.mouseIsDown = true
      MoveLight(e)
    })

    canvas.addEventListener("mousemove", e => {
      if (state.mouseIsDown) {
        MoveLight(e)
      }
    })


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

    function AngleTo(ax, ay, bx, by) {
      let dx = ax - bx
      let dy = ay - by

      let angle = Math.atan2(dx, dy);
      return angle < 0 ? Math.PI * 2 + angle : angle
    }

    function DrawProbeStorage() {
      window.requestAnimationFrame(DrawProbeStorage)


      // clear the canvas
      state.ctx.fillStyle = '#111';
      state.ctx.fillRect(0, 0, canvas.width, canvas.height);


      let centerX = Math.floor(state.canvas.width / 2.0)
      let centerY = Math.floor(state.canvas.height / 2.0)
      let lightDistanceFromCenter =  state.canvas.width * 0.45
      let lightRadius = 16.0
      let lightSpeed = 0.0001
      let levelCount = 6;
      // position a light
      if (!state.positionedWithMouse) {
        let t = Date.now() * lightSpeed
        state.lightPos[0] = centerX + Math.sin(t) * lightDistanceFromCenter
        state.lightPos[1] = centerY + Math.cos(t) * lightDistanceFromCenter
      }

      // draw the probes that are affected by the light
      let baseSize = 16;
      let baseAngularSteps = 4
      let TAU = Math.PI * 2.0
      let angleOffset = Math.PI * 0.25

      // draw a light
      state.ctx.strokeStyle = 'white'
      state.ctx.beginPath()
      state.ctx.moveTo(state.lightPos[0] + lightRadius, state.lightPos[1]);
      state.ctx.arc(state.lightPos[0], state.lightPos[1], lightRadius, 0, Math.PI * 2.0)
      state.ctx.stroke();

      let cascadeRayCounts = [];
      for (let level=0; level<=levelCount; level++) {
        let size = baseSize << level
        let angularSteps = baseAngularSteps << level
        let stepAngle = TAU / angularSteps
        let radianceIntervalStart = level > 0 ? baseSize << (level - 2) : 0;
        let radius = size / 2.0


        state.ctx.strokeStyle = levelColors[level]
        state.ctx.fillStyle = '#f0f'

        let cascadeRayCount = 0;
        for (let x = 0; x<state.canvas.width; x+=size) {
          for (let y = 0; y<state.canvas.height; y+=size) {
            let probeCenterX = x + radius
            let probeCenterY = y + radius
            let dist = Math.sqrt(
              Math.pow(probeCenterX - state.lightPos[0], 2) +
              Math.pow(probeCenterY - state.lightPos[1], 2)
            )

            let inInterval = dist <= radius && dist >= -radius
            if (!inInterval) {
              continue;
            }


            let dx = state.lightPos[0] - probeCenterX;
            let dy = state.lightPos[1] - probeCenterY
            let lightAngle = AngleTo( state.lightPos[0], state.lightPos[1], probeCenterX, probeCenterY)
            for (let step = 0; step<angularSteps; step++) {
              let angle = angleOffset + step * stepAngle;
              let nextAngle = angle + stepAngle;
              let inAngle = lightAngle >= angle && lightAngle <= nextAngle;


              state.ctx.strokeStyle = "#444";
              state.ctx.beginPath()
              let dirX = Math.sin(angle)
              let dirY = Math.cos(angle)

              state.ctx.moveTo(
                probeCenterX + dirX * radianceIntervalStart,
                probeCenterY + dirY * radianceIntervalStart
              );

              state.ctx.lineTo(
                probeCenterX + dirX * radius,
                probeCenterY + dirY * radius
              )
              cascadeRayCount++;
              state.ctx.stroke();
            }
          }
        }
        cascadeRayCounts.push(cascadeRayCount);
      }

      state.ctx.save();
      state.ctx.lineWidth = 2;
      for (let level=0; level<=levelCount; level++) {
        let size = baseSize << level
        let angularSteps = baseAngularSteps << level
        let stepAngle = TAU / angularSteps
        let radianceIntervalStart = level > 0 ? baseSize << (level - 2) : 0;
        let radius = size / 2.0

        for (let x = 0; x<state.canvas.width; x+=size) {
          for (let y = 0; y<state.canvas.height; y+=size) {
            let probeCenterX = x + radius
            let probeCenterY = y + radius
            let dist = Math.sqrt(
              Math.pow(probeCenterX - state.lightPos[0], 2) +
              Math.pow(probeCenterY - state.lightPos[1], 2)
            )

            let dirx = (probeCenterX - state.lightPos[0]) / dist
            let diry = (probeCenterY - state.lightPos[1]) / dist

            let inInterval = dist <= radius && dist >= radianceIntervalStart
            if (!inInterval) {
              continue;
            }

            let dx = state.lightPos[0] - probeCenterX;
            let dy = state.lightPos[1] - probeCenterY

            let alo = AngleTo(
              state.lightPos[0] + diry * lightRadius,
              state.lightPos[1] - dirx * lightRadius,
              probeCenterX,
              probeCenterY
            )

            let ahi = AngleTo(
              state.lightPos[0] - diry * lightRadius,
              state.lightPos[1] + dirx * lightRadius,
              probeCenterX,
              probeCenterY
            )

            for (let step = 0; step<angularSteps; step++) {
              let angle = step * stepAngle;
              let nextAngle = angle + stepAngle;

              let inAngle = false
              if (alo > ahi) {
                inAngle = (angle >= alo && angle <= TAU) || (angle >= 0 && angle <= ahi)
              } else {
                inAngle = (angle >= alo && angle <= ahi)
              }

              state.ctx.beginPath()
              if (!inAngle) {
                continue;
              }

              state.ctx.strokeStyle = levelColors[level]

              let dirX = Math.sin(angle)
              let dirY = Math.cos(angle)

              state.ctx.moveTo(
                probeCenterX + dirX * radianceIntervalStart,
                probeCenterY + dirY * radianceIntervalStart
              );

              state.ctx.lineTo(
                probeCenterX + dirX * radius,
                probeCenterY + dirY * radius
              )
              state.ctx.stroke();
            }
          }
        }
      }
      state.ctx.restore();


    }

    DrawProbeStorage()

  }
</script>

## TODO
- viz: store actual radiance values and vizualize the atlas
- accumulate bounces

## Feedback / Notes
- I wanted to visualize a ray going from the current mouse position to some arbitrary position, but
  generating the bent rays seems like a PITA, or I guess I could just blindly overlay upper cascades on every level 0 cascade... I don't think it really helps with intuition