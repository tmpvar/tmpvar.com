+++
title = "Radiance Cascades"
date = 2020-04-01
description = "Building intuition around a Radiance Cascades, a global illumination approach developed for Path of Exile 2 by Suslik (Alexander Sannikov)"
+++

Trying to build up my intuition around Suslik's Radiance Cascades GI approach.
- [paper](https://drive.google.com/file/d/1L6v1_7HY2X-LV3Ofb6oyTIxgEaP4LOI6/view?usp=sharing)
- [demo](https://www.youtube.com/watch?v=xkJ6i2N32Pc)
- [Exilecon talk](https://www.youtube.com/watch?v=B-ODrtmtpzM)

- implementations:
  - shadertoy: [Radiance Cascades](https://www.shadertoy.com/view/mtlBzX) implementation by fad - includes some temporal latency due to shadertoy/webgl deficiencies
  - shadertoy: [Radiance Cascades 2d Smooth WIP
 ](https://www.shadertoy.com/view/mlSfRD) - Suslik's fork of fad's work

## Radiance Intervals
In 2D these are bands/shells/annuluses/crusts(🍕) of radiance values where relative to the previous level, each cascade level:
- doubles the inner radius of the band
- doubles the width of the band
- doubles the number of rays per probe
- halves the total number of rays

<section id="radiance-intervals-2d-controls">
  <p>
  level 0 ray count: <input type="range" min="4" max="8" value="4" name="level-0-ray-count">
  </p>

  <p>
  branching factor(N<sup>level</sup>): <input type="range" min="1" max="3" value="2" name="branching-factor">
  </p>
</section>

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

    const DrawRadianceIntervals = () => {
      window.requestAnimationFrame(DrawRadianceIntervals)
      let dirty = false;
      let controlEl = document.getElementById('radiance-intervals-2d-controls')

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

      for (var level=0; level <= levelCount; level++) {
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
        state.ctx.arc(centerX, centerY, radius, 0, Math.PI*2.0)
        state.ctx.stroke();

        let angularSteps = baseAngularSteps << (level * state.params.branchingFactor)
        state.ctx.beginPath()
        for (let step = 0; step<angularSteps; step++) {
          let angle = TAU * (step + 0.5) / angularSteps;

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

<section id="ray-distributions-2d-controls">
  <p>
  level: <input type="range" min="0" max="6" value="0" name="level-slider">
  </p>

  <p>
  2<sup>level</sup> spacing (level 0): <input type="range" min="0" max="6" value="4" name="i-slider">
  </p>

  <p>
  branching factor(N<sup>level</sup>): <input type="range" min="1" max="3" value="2" name="level-branching-factor">
  </p>

  <p>
  color lower levels: <input type="checkbox" value="1" checked name="color-lower-levels">
  </p>
  <p>
  show cascade ray counts: <input type="checkbox" value="1" name="show-cascade-ray-counts">
  </p>
</section>

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
      for (let level=0; level<=state.params.levelSlider; level++) {
        let angularSteps = baseAngularSteps << (level * state.params.branchingFactor)
        let radius = startingProbeRadius << (level * state.params.branchingFactor)
        let diameter = radius * 2
        let prevRadius = level > 0 ? (startingProbeRadius << (level - 1)) : 0;

        state.ctx.strokeStyle = levelColors[level]
        state.ctx.fillStyle = '#f0f'
        let cascadeRayCount = 0;
        for (let x = 0; x<state.canvas.width; x+=diameter) {
          for (let y = 0; y<state.canvas.height; y+=diameter) {
            state.ctx.beginPath()
            let centerX = x + radius
            let centerY = y + radius
            for (let step = 0; step<angularSteps; step++) {
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
</script>


### Probe Ray Interpolation

<section id="probe-interpolation-2d-controls">
  <p>
  min level: <input type="range" min="0" max="6" value="1" name="minLevel-slider">
  </p>
  <p>
  max level: <input type="range" min="0" max="6" value="2" name="maxLevel-slider">
  </p>

  <p>
  branching factor(N<sup>level</sup>): <input type="range" min="1" max="3" value="1" name="level-branching-factor">
  </p>

  <p>
  level 0 ray count: <input type="range" min="1" max="32" value="4" name="level-0-ray-count">
  </p>
</section>

<section class="center-align">
  <canvas id="probe-interpolation-2d-canvas" width="1024" height="1024"></canvas>
</section>

<script>
  // tuck this into a scope so we can have multiple interactive context2ds on this page
  {
    // Setup
    let canvas = document.getElementById('probe-interpolation-2d-canvas');
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

    const DrawRayDistributions2D = () => {
      window.requestAnimationFrame(DrawRayDistributions2D)
      let controlEl = document.getElementById('probe-interpolation-2d-controls');
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
      for (let level=state.params.minLevel; level<=state.params.maxLevel; level++) {
        let angularSteps = baseAngularSteps << (level * state.params.branchingFactor)
        let radius = (startingProbeRadius << (level * state.params.branchingFactor)) - levelPadding
        let prevRadius = level > 0
          ? (startingProbeRadius << ((level - 1) * state.params.branchingFactor))  - levelPadding
          : 0;

        state.ctx.strokeStyle = levelColors[level]
        state.ctx.fillStyle = '#f0f'
        let cascadeRayCount = 0;
        for (let x = 0; x<state.canvas.width; x+=diameter) {
          for (let y = 0; y<state.canvas.height; y+=diameter) {
            state.ctx.beginPath()
            let centerX = x + startingProbeRadius
            let centerY = y + startingProbeRadius
            for (let step = 0; step<angularSteps; step++) {
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
</script>

### Probe Rays vs Light

Visualize the radiance intervals that have a light in their bounds by drawing the quantized angle to the light

click/drag to move the light
<section id="probe-rays-vs-light-controls">
  <p>
  min level: <input type="range" min="0" max="6" value="0" name="minLevel-slider">
  </p>
  <p>
  max level: <input type="range" min="0" max="6" value="6" name="maxLevel-slider">
  </p>
  <p>
  light radius: <input type="range" min="16" max="500" value="1" name="lightRadius-slider">
  </p>

  <p>
  show light/probe overlap <input type="checkbox" value="1" name="showProbeOverlapCheckbox" />
  </p>

  <p>
    branching factor(N<sup>level</sup>): <input type="range" min="1" max="3" value="2" name="level-branching-factor">
  </p>
</section>
<section class="center-align">
  <canvas id="probe-rays-vs-light-canvas" width="1024" height="1024"></canvas>
</section>


<script>
  // tuck this into a scope so we can have multiple interactive context2ds on this page
  {
    // Setup
    let canvas = document.getElementById('probe-rays-vs-light-canvas');
    let state = {
      canvas: canvas,
      ctx: canvas.getContext('2d'),
      params: {
        minLevel: 0,
        maxLevel: 6,
        lightRadius: 5,
      },
      lightPos: [0, 0],
      positionedWithMouse: false,
      mouseIsDown: false,
      lastMouseDown: [0, 0],
      dirty: true,
    }

    state.ctx.lineWidth = 2;

    const Param = (name, value) => {
      if (state.params[name] != value) {
        state.params[name] = value;
        return true;
      }
      return false;
    }

    const ComputeOffset = (el, offset) => {
      if (!el) {
        return offset
      }

      offset.left += el.offsetLeft
      offset.top += el.offsetTop
      return ComputeOffset(el.parentOffset, offset)
    }

    const Min = Math.min
    const Max = Math.max
    const Pow = Math.pow
    const Sqrt = Math.sqrt
    const Clamp = (v, lo, hi) => {
      return v < lo ? lo : (v > hi ? hi : v);
    }

    const MoveLight = (x, y) => {
      let ratioX = canvas.width / canvas.clientWidth
      let ratioY = canvas.height / canvas.clientHeight

      state.lightPos[0] = x * ratioX
      state.lightPos[1] = y * ratioY

      state.lightPos[0] = Clamp(
        state.lightPos[0],
        0,
        canvas.width
      )

      state.lightPos[1] = Clamp(
        state.lightPos[1],
        0,
        canvas.height
      )

      state.positionedWithMouse = true
      state.dirty = true
    }

    window.addEventListener("mouseup", e => {
      state.mouseIsDown = false
    })

    canvas.addEventListener("mousedown", (e) => {
      state.mouseIsDown = true
      MoveLight(e.offsetX, e.offsetY)
      e.preventDefault()
    }, { passive: false })

    canvas.addEventListener("mousemove", e => {
      if (state.mouseIsDown) {
        MoveLight(e.offsetX, e.offsetY)
        e.preventDefault()
      }
    }, { passive: false })

    canvas.addEventListener("touchstart", (e) => {
      if (e.touches.length == 1) {
        state.mouseIsDown = true
        let touch = e.touches[0]

        let rect = e.target.getBoundingClientRect();
        MoveLight(touch.clientX - rect.x, touch.clientY - rect.y)
        e.preventDefault()
      }
    }, { passive: false })

    canvas.addEventListener("touchmove", e => {
      if (e.touches.length == 1) {
        if (state.mouseIsDown) {
          let touch = e.touches[0]
          let rect = e.target.getBoundingClientRect();
          MoveLight(touch.clientX - rect.x, touch.clientY - rect.y)
          e.preventDefault()
        }
      }
    }, { passive: false })


    // clear the canvas
    state.ctx.fillStyle = '#111';
    state.ctx.fillRect(0, 0, canvas.width, canvas.height);
    let levelCount = 0;
    let levelColors = [
      '#f3a833',
      '#9de64e',
      '#36c5f4',
      '#ffa2ac',
      '#cc99ff',
      '#ec273f',
      '#de5d3a',
      '#006554',
    ]

    const AngleTo = (ax, ay, bx, by) => {
      let dx = ax - bx
      let dy = ay - by

      let angle = Math.atan2(dx, dy);
      return angle < 0 ? Math.PI * 2 + angle : angle
    }


    /*
      Calculate the intersection of a ray and a sphere
      The line segment is defined from p1 to p2
      The sphere is of radius r and centered at sc
      There are potentially two points of intersection given by
      p = p1 + mu1 (p2 - p1)
      p = p1 + mu2 (p2 - p1)
      Return FALSE if the ray doesn't intersect the sphere.
      see: http://paulbourke.net/geometry/circlesphere/
    */
    const RaySphere = (p1, p2, sc, r) => {
      let dp = [
        p2[0] - p1[0],
        p2[1] - p1[1]
      ]

      let a = dp[0] * dp[0] + dp[1] * dp[1];
      let b = 2 * (dp[0] * (p1[0] - sc[0]) + dp[1] * (p1[1] - sc[1]));
      let c = sc[0] * sc[0] + sc[1] * sc[1];
      c += p1[0] * p1[0] + p1[1] * p1[1];
      c -= 2 * (sc[0] * p1[0] + sc[1] * p1[1]);
      c -= r * r;
      let bb4ac = b * b - 4 * a * c;
      if (Math.abs(a) < 1e-10 || bb4ac < 0) {
        return false;
      }
      return [
        (-b + Sqrt(bb4ac)) / (2 * a),
        (-b - Sqrt(bb4ac)) / (2 * a)
      ]
    }

    const DrawRaysVsLight = () => {
      window.requestAnimationFrame(DrawRaysVsLight)

      let controlEl = document.getElementById('probe-rays-vs-light-controls');

      state.dirty = state.dirty || Param(
        'minLevel',
        parseFloat(controlEl.querySelector('input[name="minLevel-slider"]').value)
      )
      state.dirty = state.dirty || Param(
        'maxLevel',
        parseFloat(controlEl.querySelector('input[name="maxLevel-slider"]').value)
      )

      state.dirty = state.dirty || Param(
        'lightRadius',
        parseFloat(controlEl.querySelector('input[name="lightRadius-slider"]').value)
      )

      state.dirty = state.dirty || Param(
        'showProbeOverlap',
        !!controlEl.querySelector('input[name="showProbeOverlapCheckbox"]').checked
      )

      state.dirty = state.dirty || Param(
        'branchingFactor',
        parseFloat(controlEl.querySelector('input[name="level-branching-factor"]').value)
      )


      if (!state.dirty) {
        return
      }
      state.dirty = false;

      // clear the canvas
      state.ctx.fillStyle = '#111';
      state.ctx.fillRect(0, 0, canvas.width, canvas.height);


      let centerX = Math.floor(state.canvas.width / 2.0)
      let centerY = Math.floor(state.canvas.height / 2.0)
      let lightDistanceFromCenter =  state.canvas.width * 0.25

      let lightSpeed = 0.0001
      // position a light
      if (!state.positionedWithMouse) {
        let t = Date.now() * lightSpeed
        t = Math.PI - 0.4
        state.lightPos[0] = centerX + Math.sin(t) * lightDistanceFromCenter + 90
        state.lightPos[1] = centerY + Math.cos(t) * lightDistanceFromCenter
      }

      // draw the probes that are affected by the light
      let startingProbeRadius = 16;
      let baseAngularSteps = 4
      let TAU = Math.PI * 2.0


      // draw a light
      state.ctx.strokeStyle = 'white'
      state.ctx.beginPath()
      state.ctx.moveTo(state.lightPos[0] + state.params.lightRadius, state.lightPos[1]);
      state.ctx.arc(state.lightPos[0], state.lightPos[1], state.params.lightRadius, 0, Math.PI * 2.0)
      state.ctx.stroke();


      if (state.params.showProbeOverlap) {
        for (let level=state.params.minLevel; level<=state.params.maxLevel; level++) {

          let angularSteps = baseAngularSteps << (level * state.params.branchingFactor)
          let stepAngle = TAU / angularSteps
          let radius = startingProbeRadius << (level * state.params.branchingFactor)
          let diameter = radius * 2
          let prevRadius = level > 0 ? (startingProbeRadius << (level - 1)) : 0;
          // let bandSize = radius - radianceIntervalStart

          state.ctx.strokeStyle = levelColors[level]
          state.ctx.fillStyle = '#f0f'

          for (let x = 0; x<state.canvas.width; x+=diameter) {
            for (let y = 0; y<state.canvas.height; y+=diameter) {
              let probeCenterX = x + radius
              let probeCenterY = y + radius
              let dist = Math.sqrt(
                Math.pow(probeCenterX - state.lightPos[0], 2) +
                Math.pow(probeCenterY - state.lightPos[1], 2)
              )

              let inLight = dist <= radius && state.params.lightRadius > radius
              let inInterval = (
                dist + state.params.lightRadius >= prevRadius &&
                dist - state.params.lightRadius <= radius
              ) || inLight

              if (!inInterval) {
                continue;
              }


              let dx = state.lightPos[0] - probeCenterX
              let dy = state.lightPos[1] - probeCenterY
              let lightAngle = AngleTo( state.lightPos[0], state.lightPos[1], probeCenterX, probeCenterY)
              for (let step = 0; step<angularSteps; step++) {
                let angle = TAU * (step + 0.5) / angularSteps
                let nextAngle = TAU * (step + 1 + 0.5) / angularSteps
                let inAngle = lightAngle >= angle && lightAngle <= nextAngle;


                state.ctx.strokeStyle = "#444";
                state.ctx.beginPath()
                let dirX = Math.sin(angle)
                let dirY = Math.cos(angle)

                state.ctx.moveTo(
                  probeCenterX + dirX * prevRadius,
                  probeCenterY + dirY * prevRadius
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
      }

      for (let level=state.params.minLevel; level<=state.params.maxLevel; level++) {

        let angularSteps = baseAngularSteps << (level * state.params.branchingFactor)
        let stepAngle = TAU / angularSteps

        let radius = startingProbeRadius << (level * state.params.branchingFactor)
        let diameter = radius * 2
        let prevRadius = level > 0
          ? (startingProbeRadius << ((level - 1) * state.params.branchingFactor))
          : 0;

        for (let x = 0; x<state.canvas.width; x+=diameter) {
          for (let y = 0; y<state.canvas.height; y+=diameter) {
            let probeCenterX = x + radius
            let probeCenterY = y + radius
            let dist = Math.sqrt(
              Math.pow(probeCenterX - state.lightPos[0], 2) +
              Math.pow(probeCenterY - state.lightPos[1], 2)
            )

            let dirx = (probeCenterX - state.lightPos[0]) / dist
            let diry = (probeCenterY - state.lightPos[1]) / dist

            let inLight = dist <= (state.params.lightRadius - radius) && state.params.lightRadius > radius
            let inInterval = (
              dist + state.params.lightRadius >= prevRadius &&
              dist - state.params.lightRadius <= radius
            ) || inLight
            if (!inInterval) {
              continue;
            }

            for (let step = 0; step<angularSteps; step++) {
              let angle = TAU * (step + 0.5) / angularSteps;
              let nextAngle = TAU * (step + 1.0 + 0.5) / angularSteps;

              state.ctx.beginPath()

              let dirX = Math.sin(angle)
              let dirY = Math.cos(angle)

              let result = RaySphere(
                [
                  probeCenterX + dirX * prevRadius,
                  probeCenterY + dirY * prevRadius
                ],
                [
                  probeCenterX + dirX * radius,
                  probeCenterY + dirY * radius
                ],
                state.lightPos,
                state.params.lightRadius
              )


              if (!result) {
                continue;
              }

              let valid = !(result[0] < 0 && result[1] < 0)
              if (!valid) {
                continue;
              }

              state.ctx.strokeStyle = levelColors[level]


              state.ctx.moveTo(
                probeCenterX + dirX * prevRadius,
                probeCenterY + dirY * prevRadius
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
    }

    DrawRaysVsLight()

  }
</script>

### Probe Ray DDA (2D)

<section id="probe-ray-dda-2d-controls">

  <p>
  2<sup>i</sup> spacing (level 0): <input type="range" min="1" max="9" value="3" name="i-slider">
  </p>

  <p>
  branching factor(N<sup>level</sup>): <input type="range" min="1" max="3" value="1" name="level-branching-factor">
  </p>

  <p>
  interval radius (level 0): <input type="range" min="0" max="1024" value="100" name="interval-radius-slider">
  </p>

  <p>
  max probe level: <input type="range" min="0" max="10" value="10" name="probe-level">
  </p>

  <p>
  erase <input type="checkbox" value="1" name="brush-erase-mode" />
  </p>

  <p>
  brush radiance: <input type="range" min="0" max="20" value="1" step="0.1" name="brush-radiance-slider">
  </p>

  <p>
  brush radius: <input type="range" min="2" max="100" value="5" name="brush-radius-slider">
  </p>

  <p>
  color: <input type="color" name="brush-color-selector" value="#646464">
  </p>

  <p>
  debug probe directions <input type="checkbox" value="1" name="debug-probe-directions-mode" />
  </p>
</section>


<section class="center-align">
  <canvas id="probe-ray-dda-2d-canvas" width="1024" height="1024"></canvas>
</section>
<script src="probe-ray-dda-2d.js" defer></script>

#### approach

- __storage__: create an 'SSBO' for probes that has enough space to cover level 0 (e.g., `probeCount * raysPerProbe`). Double this size so we can ping pong cascade levels
- __raymarch__: for level=max..0
  - cast rays from the probe center offset by the level's interval start
  - dda through the world texture (emitters / occluders)
  - if ray hits an emitter write store radiance in SSBO
  - if ray hits occluder write 0 into SSBO
  - if ray hits nothing (and level < max)
    - fetch upper level by bilinear interpolation and store value in SSBO
- __irradiance__: compute irradiance per probe by accumulating the max over probe values stored in SSBO (e.g., component-wise max of all rays for the associated level 0 probe)

