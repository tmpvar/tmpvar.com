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
  - shadertoy: [Radiance Cascades](https://www.shadertoy.com/view/mtlBzX) implementation by fad - includes some temporal latency due to shadertoy limitations.
  - shadertoy: [Radiance Cascades 2d Smooth WIP
 ](https://www.shadertoy.com/view/mlSfRD) - Suslik's fork of fad's work

## 2D

Things are simpler in 2D so we'll start there.

### Radiance Intervals (2D)
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

### Ray Distributions (2D)
<section id="ray-distributions-2d-content">
  <p>
    <b>Note:</b> this demo is limited to spatial doubling for cascade levels irregardless of the branching factor, which is the common case for flatland.
  </p>

  <section class="controls">
    <section id="ray-distributions-2d-controls">
      <div class="maxLevel-control control">
        max level <input type="range" min="0" max="6" value="2">
        <output></output>
      </div>
      <div class="probeRayCount-control control">
        2<sup>r</sup> raycount (level 0): <input type="range" min="2" max="5" value="2">
        <output></output>
      </div>
      <div class="probeDiameter-control control">
        probe diameter (level 0): <input type="range" min="2" max="7" value="6">
        <output></output>
      </div>
      <div class="intervalRadius-control control">
        interval radius (level 0): <input type="range" min="0" max="64" value="9">
        <output></output>
      </div>
      <div class="branchingFactor-control control">
        branching factor(N<sup>level</sup>): <input type="range" min="1" max="3" value="2" name="level-branching-factor">
        <output></output>
      </div>
      <div class="colorLowerLevels-control control">
        color lower levels: <input type="checkbox" value="1" checked name="color-lower-levels">
      </div>
      <div class="showCascadeRayCounts-control control">
        show cascade ray counts: <input type="checkbox" value="1">
      </div>
    </section>
  </section>

  <section class="center-align">
    <canvas width="1024" height="1024"></canvas>
  </section>
  <script src="flatland-2d/probe-ray-distributions-2d.js" defer type="module"></script>
</section>

### Probe Ray Interpolation (2D)

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

<!-- alias so the rename doesn't really break things-->
<span id="probe-ray-dda-2d"></span>

### Flatland (2D)

<section id="flatland-2d-content" class="has-webgpu">
  <section class="controls" class="webgpu-required">
    <h4>Debug/Development</h4>
    <div class="indent">
    <div class="debugPerformance-control control">
      run continuously and collect frame timings <input type="checkbox" value="1" />
      <span class="timestamp-query-unavailable error" style="display:none">unavailabe, look in the javascript console for "timestamp-query"</span>
      <div class="performance-output" style="margin-right: -50%">
        timings
        <code><pre></pre></code>
      </div>
    </div>
    <div class="debugWorldMipmapLevelRender-control control">
    render world mip level
    <select>
      <option value="-1">disabled</option>
      <option value="0">0</option>
      <option value="1">1</option>
      <option value="2">2</option>
      <option value="3">3</option>
      <option value="4">4</option>
      <option value="5">5</option>
      <option value="6">6</option>
      <option value="7">7</option>
      <option value="8">8</option>
      <option value="9">9</option>
    </select>
    </div>
    <div class="debugProbeDirections-control control">
      render probe directions <input type="checkbox" value="1" />
    </div>
    <div class="debugDisbleBrushPreview-control control">
      disable brush preview <input type="checkbox" value="1" />
    </div>
    <div class="debugRaymarchMipmaps-control control">
      raymarch mipmap N on cascade level N <input type="checkbox" value="1" checked />
    </div>
    <div class="debugRaymarchWithDDA-control control">
      raymarch with dda<input type="checkbox" value="1" />
    </div>
    <div class="debugRaymarchFixedSizeStepMultiplier-control control">
      raymarch fixed size step multiplier: <input type="range" min="1" max="1000" value="100">
      <output></output>
    </div>
    </div>
    <h4>Radiance Cascade Parameters</h4>
    <div class="indent">
      <div class="probeRadius-control control">
        2<sup>i</sup> spacing (level 0): <input type="range" min="1" max="9" value="1">
        <output></output>
      </div>
      <div class="probeRayCount-control control">
        2<sup>r</sup> raycount (level 0): <input type="range" min="1" max="6" value="2">
        <output></output>
      </div>
      <div class="branchingFactor-control control">
        branching factor: <input type="range" min="1" max="3" value="2">
        <output></output>
      </div>
      <div class="intervalRadius-control control">
        interval radius (level 0): <input type="range" min="0" max="32.0" value="2.6" step="0.1">
        <output></output>
      </div>
      <div class="intervalAccumulationDecay-control control">
        interval accumulation decay: <input type="range" min="1" max="400" value="100">
        <output></output>
      </div>
      <div class="maxProbeLevel-control control">
        max probe level: <input type="range" min="0" max="10" value="10">
        <output></output>
      </div>
    </div>
    <h4>Brush Parameters</h4>
    <div class="indent">
      <div class="control" style="float: right">
        <button name="clear-button">Clear Canvas</button>
      </div>
      <div class="control brushEraseMode-control">
        erase <input type="checkbox" value="1" />
      </div>
      <div class="control brushOpacity-control">
        brush opacity: <input type="range" min="0" max="255" value="255" step="1">
        <output></output>
      </div>
      <div class="brushRadiance-control control">
        brush radiance: <input type="range" min="0" max="20" value="1" step="0.01">
        <output></output>
      </div>
      <div class="brushRadius-control control">
        brush radius: <input type="range" min="2" max="100" value="5">
        <output></output>
      </div>
      <div class="brushColor-control control">
        brush color: <input type="color" value="#FFFC99">
      </div>
    </div>
  </section>
  <section class="center-align webgpu-required">
    <canvas id="flatland-2d-canvas" width="1024" height="1024"></canvas>
    <script type="module" src="flatland-2d/flatland-2d.js" defer></script>
    <section class="center-align webgpu-missing error-border">
      <img src="/img/webgpu-responsive.svg" width="768" height="768" />
      <p class="error">
        This demo requires <a href="https://en.wikipedia.org/wiki/WebGPU">WebGPU</a> - in other words, you should open this page in Chrome or Edge.
      <p>
    </section>
  </section>
</section>

## 3D

### World Space Storage Requirements (3D)
<section id="world-space-storage-requirements-3d-content">
  <p>
    Compute a storage cost table for world space probes, using a ping-pong buffer, at various
    spatial resolutions.
  </p>
  <code><pre>
rayCount = 6
bytesPerRay = 16
diameter<sup>3</sup> * rayCount * bytesPerRay * 2</pre></code>
  <table>
    <thead>
      <tr>
        <td>diameter</td>
        <td>megabytes</td>
      </tr>
    </thead>
    <tbody>
    </tbody>
  </table>

  <script type="module">
    const root = document.querySelector('#world-space-storage-requirements-3d-content')

    const tbody = root.querySelector('tbody')
    const rayCount = 6
    const bytesPerRay = 16
    const MB = Math.pow(1024, 2)
    for (let d = 4; d<11; d++) {
      let diameter = Math.pow(2, d)
      let volume = Math.pow(diameter, 3)

      const row = document.createElement('tr')
      const cellDiameter = document.createElement('td')
      cellDiameter.innerText = diameter
      row.appendChild(cellDiameter)

      const cellMemory = document.createElement('td')
      cellMemory.innerText = (volume * rayCount * bytesPerRay)/MB * 2
      row.appendChild(cellMemory)

      tbody.appendChild(row)
    }

  </script>
</section>
