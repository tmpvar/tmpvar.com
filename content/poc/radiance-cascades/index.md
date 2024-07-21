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

 - blog posts:
   - Yaazarai wrote about [Radiance Cascades](https://mini.gmshaders.com/p/radiance-cascades) on GM Shader Tuts

## 2D

Things are simpler in 2D so we'll start there.

### Radiance Intervals (2D)
<section id="radiance-intervals-2d-content">

  In 2D these are bands/shells/annuluses/crusts(🍕) of radiance values where relative to the previous level, each cascade level:
  - doubles the inner radius of the band
  - doubles the width of the band
  - doubles the number of rays per probe
  - halves the total number of rays
  - offsets the rays to avoid overlaps (e.g., <code>angle = TAU * (rayIndex + 0.5) / rayCount</code>)


  <section class="controls">
    <div class="level0RayCount-control control">
      level 0 ray count: <input type="range" min="4" max="8" value="4" />
      <output></output>
    </div>
    <div class="branchingFactor-control control">
      branching factor(N<sup>level</sup>): <input type="range" min="1" max="3" value="2">
      <output></output>
    </p>
  </section>
  <section class="center-align">
    <canvas width="1024" height="1024"></canvas>
  </section>
  <p>
    source: <a href="flatland-2d/radiance-intervals-2d.js" target="_blank">flatland-2d/radiance-intervals-2d.js</a>
  </p>
  <script type="module" src="flatland-2d/radiance-intervals-2d.js"></script>
</section>

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
  <p>
    source: <a href="flatland-2d/probe-ray-distributions-2d.js" target="_blank">flatland-2d/probe-ray-distributions-2d.js</a>
  </p>
  <script src="flatland-2d/probe-ray-distributions-2d.js" defer type="module"></script>
</section>

### Probe Ray Interpolation (2D)

<section id="probe-interpolation-2d-content">
  <section class="controls">
    <div class="minLevel-control control">
      min level: <input type="range" min="0" max="6" value="1">
      <output></output>
    </div>
    <div class="maxLevel-control control">
      max level: <input type="range" min="0" max="6" value="2">
      <output></output>
    </div>
    <div class="level0RayCount-control control">
      level 0 ray count: <input type="range" min="1" max="32" value="4" />
      <output></output>
    </div>
    <div class="branchingFactor-control control">
      branching factor(N<sup>level</sup>): <input type="range" min="1" max="3" value="1">
      <output></output>
    </p>
  </section>

  <section class="center-align">
    <canvas width="1024" height="1024"></canvas>
  </section>
  <p>
    source: <a href="flatland-2d/probe-interpolation-2d.js" target="_blank">flatland-2d/probe-interpolation-2d.js</a>
  </p>
  <script type="module" src="flatland-2d/probe-interpolation-2d.js"></script>
</section>

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
    <div class="debugAccumulateNonlinearly-control control">
      accumulate non-linearly<input type="checkbox" value="1" />
    </div>
    <div class="debugAccumulationDecay-control control">
      accumulation decay: <input type="range" min="1" max="400" value="100">
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
      <div class="maxProbeLevel-control control">
        levels: <input type="range" min="0" max="9" value="5">
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
  <section class="center-align">
    <canvas id="flatland-2d-canvas" class="webgpu-required" width="1024" height="1024"></canvas>
    <section class="center-align webgpu-missing error-border">
      <img src="/img/webgpu-responsive.svg" width="768" height="768" />
      <p class="error">
        This demo requires <a href="https://en.wikipedia.org/wiki/WebGPU">WebGPU</a> - in other words, you should open this page in Chrome or Edge.
      <p>
    </section>
  </section>
  <p>
    source: <a href="flatland-2d/flatland-2d.js" target="_blank">flatland-2d/flatland-2d.js</a>
  </p>
  <script type="module" src="flatland-2d/flatland-2d.js"></script>
</section>

## Screenspace probes with Worldspace Intervals (3D)

<section id="ssprobes-wsintervals-content">
  <p>
    Compute a storage cost table for screen-space probes with world space intervals
  </p>

  <section class="controls" class="webgpu-required">
    <h4>World Space</h4>
    <div class="indent">
      <div class="WorldSpace_C0_Directions-control control">
        <input type="range" min="1" max="32" value="2"> probe directions
        <output></output>
      </div>
    </div>
    <h4>Screen Space</h4>
    <div class="indent">
      <div class="ScreenSpace_C0_ProbeSpacing-control control">
        <input type="range" min="1" max="32" value="2"> probe spacing
        <output></output>
      </div>
    </div>
    <h4>General</h4>
    <div class="indent">
      <div class="General_Keep_Unmerged-control control">
        <input type="checkbox" value="1" checked> keep merged and unmerged cascades
        <div class="param-note">
          This keeps the data around that is used to compute reflections for surfaces defined by GGX or similar roughness models.
        </div>
        <output></output>
      </div>
      <div class="General_Use_Min_And_Max_Depth-control control">
        <input type="checkbox" value="1" checked> place screenspace probes on min <b>and</b> max depth
        <div class="param-note">
          This helps with scenes that have high depth complexity with thin objects.
        <div>
        <output></output>
      </div>
    </div>
  </section>
  <section class='results'>
  </section>
  <p>
    source: <a href="ssprobes-wsintervals/ssprobes-wsintervals.js" target="_blank">ssprobes-wsintervals/ssprobes-wsintervals.js</a>
  </p>
  <script type="module" src="ssprobes-wsintervals/ssprobes-wsintervals.js"></script>

## World Space Probes (3D)
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
        <td>MB per slice</td>
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
      let area = Math.pow(diameter, 2)

      const row = document.createElement('tr')
      const cellDiameter = document.createElement('td')
      cellDiameter.innerText = diameter
      row.appendChild(cellDiameter)

      {
        const cellMemory = document.createElement('td')
        cellMemory.innerText = (volume * rayCount * bytesPerRay)/MB * 2
        row.appendChild(cellMemory)
      }

      {
        const cellMemory = document.createElement('td')
        cellMemory.innerText = (area * rayCount * bytesPerRay)/MB * 2
        row.appendChild(cellMemory)
      }

      tbody.appendChild(row)
    }

  </script>

## Licensing

### Text / Images

<p xmlns:cc="http://creativecommons.org/ns#" xmlns:dct="http://purl.org/dc/terms/"><a property="dct:title" rel="cc:attributionURL" href="https://tmpvar.com/poc/radiance-cascades/">tmpvar's radiance cascades 2D playground</a> is licensed under <a href="https://creativecommons.org/licenses/by/4.0/?ref=chooser-v1" target="_blank" rel="license noopener noreferrer" style="display:inline-block;">CC BY 4.0<img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/cc.svg?ref=chooser-v1"><img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/by.svg?ref=chooser-v1"></a></p> which includes the text and images on this page.

### Linked Source Code

All of the linked source code is licensed MIT as specified in the header of each file.

</section>
