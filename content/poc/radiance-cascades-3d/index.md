+++
title = "Radiance Cascades 3D"
date = 2020-04-01
description = "Building intuition around a Radiance Cascades, a global illumination approach developed for Path of Exile 2 by Suslik (Alexander Sannikov)"

[extra]
unlisted = false
+++

## 3D

### Probe Ray Distribution (3D)
<section id="probe-ray-distribution-3d-content" class="has-webgpu">
  <section class="controls">
    <div class="rayPackingApproach-control control">
      approach:
      <select>
        <option value="cube-face-subdivision">Cube Face Subdivision</option>
        <option value="lat-lon-subdivision">Lat/Lon Subdivision</option>
        <option value="golden-spiral">Golden Spiral</option>
        <option value="kogan-spiral">Kogan Spiral</option>
        <option value="golden-hemisphere">Golden Hemisphere</option>
        <option value="random-hemisphere">Random Hemisphere</option>
        <option value="random-uniform-hemisphere" selected>Uniform Random Hemisphere</option>
        <option value="uniform-hemisphere" selected>Uniform Hemisphere</option>
      </select>
    </div>
    <div class="minLevel-control control">
      min level: <input type="range" min="0" max="6" value="0">
      <output></output>
    </div>
    <div class="maxLevel-control control">
      max level: <input type="range" min="0" max="6" value="1">
      <output></output>
    </div>
  </section>

  <section class="center-align webgpu-required">
    <canvas width="1024" height="1024"></canvas>
  </section>

  <script src="probe-ray-distribution-3d/probe-ray-distribution-3d.js" defer type="module"></script>

  <section class="center-align webgpu-missing error-border">
    <img src="/img/webgpu-responsive.svg" width="768" height="768" />
    <p class="error">
      This demo requires <a href="https://en.wikipedia.org/wiki/WebGPU">WebGPU</a> - in other words, you should open this page in Chrome or Edge.
    <p>
  </section>
</section>

### Screen Space (3D)
<span class="highlight-blue">🚧 Work in progress 🚧</span>
<section id="screen-space-3d-content" class="has-webgpu">
  <section class="controls">
    <h4>Debug/Development</h4>
    <div class="indent">
      <div class="debugMaxProbeLevel-control control">
        max probe level: <input type="range" min="0" max="6" step="1" value="1">
        <output></output>
      </div>
      <div class="debugRenderObjectIDBuffer-control control">
        render object IDs <input type="checkbox" value="1" />
      </div>
      <div class="debugRenderObjectTypeIDBuffer-control control">
        render object type IDs <input type="checkbox" value="1" />
      </div>
      <div class="debugRenderNormals-control control">
        render normals <input type="checkbox" value="1" />
      </div>
      <div class="debugRenderDepth-control control">
        render depth <input type="checkbox" value="1" />
      </div>
      <div class="debugRenderRawFluence-control control">
        render fluence <input type="checkbox" value="1" checked />
      </div>
      <div class="approach-control control">
        raycasting approach:
        <select>
          <option value="screen-space/brute-force">Screen Space Brute Force</option>
          <option value="world-space/brute-force" selected>World Space Brute Force</option>
        </select>
        <div class="shownBy-approach indent" showValue="screen-space/brute-force">
          <div class="bruteForceRaysPerPixelPerFrame-control control">
            rays per pixel per frame: <input type="range" min="1" max="64" value="1" step="1">
            <output></output>
          </div>
       </div>
        <div class="shownBy-approach indent" showValue="world-space/brute-force">
          <div class="bruteForceRaysPerPixelPerFrame-control control">
            rays per pixel per frame: <input type="range" min="1" max="64" value="1" step="1">
            <output></output>
          </div>
       </div>
      </div>
    </div>
    <h4>Scene Parameters</h4>
    <div class="indent">
      <div class="scene-control control">
        scene:
        <select>
          <option value="simple/emissive-sphere">Single Emissive Sphere</option>
          <option value="simple/emissive-sphere-with-occluder" selected >Single Emissive Sphere + Occluder</option>
        </select>
      </div>
      <div class="shownBy-scene indent" showValue="simple/emissive-sphere-with-occluder">
        <div class="sceneOccluderScale-control control">
          scale (x,z): <input type="range" min="0.01" max="10.0" value="1.0" step="0.01">
          <output></output>
        </div>
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
        interval radius (level 0): <input type="range" min="0" max="256" value="70">
        <output></output>
      </div>
    </div>
  </section>

  <section class="center-align webgpu-required">
    <canvas width="1024" height="1024"></canvas>
  </section>

  <script src="screen-space-3d/screen-space-3d.js" defer type="module"></script>

  <section class="center-align webgpu-missing error-border">
    <img src="/img/webgpu-responsive.svg" width="768" height="768" />
    <p class="error">
      This demo requires <a href="https://en.wikipedia.org/wiki/WebGPU">WebGPU</a> - in other words, you should open this page in Chrome or Edge.
    <p>
  </section>
</section>

### Fuzz World (3D)
<span class="highlight-blue">(Work in progress)</span>
<section id="fuzz-world-3d-content" class="has-webgpu">
  <section class="controls">
    <h4>Debug/Development</h4>
    <div class="indent">
      <div class="scene-control control">
        scene:
        <select>
          <option value="single-centered-sphere" selected>Single Sphere</option>
          <option value="occluder">Occluder</option>
          <option value="fractal-with-sphere">Fractal</option>
        </select>
      </div>
      <div class="debugRaymarchFixedSizeStepMultiplier-control control">
        raymarch fixed size step multiplier: <input type="range" min="0.1" max="100.0" step="0.01" value="2.0">
        <output></output>
      </div>
      <div class="debugMaxProbeLevel-control control">
        max probe level: <input type="range" min="0" max="6" step="1" value="1">
        <output></output>
      </div>
      <div class="debugRenderRawFluence-control control">
        render fluence <input type="checkbox" value="1" checked/>
      </div>
    </div>
    <h4>Radiance Cascade Parameters</h4>
    <div class="indent">
      <div class="probeRayCount-control control">
        4<sup>r</sup> raycount (level 0): <input type="range" min="0" max="1" value="0" disabled>
        <output></output>
      </div>
      <div class="branchingFactor-control control">
        branching factor: <input type="range" min="1" max="1" value="1" disabled>
        <output></output>
      </div>
      <div class="intervalRadius-control control">
        interval radius (level 0): <input type="range" min="0" max="256" value="70">
        <output></output>
      </div>
      <div class="probeLatticeDiameter-control control">
        probe lattice diameter (level 0): <input type="range" min="2" max="6" value="5">
        <output></output>
      </div>
    </div>
  </section>

  <section class="center-align webgpu-required">
    <canvas width="1024" height="1024"></canvas>
  </section>

  <script src="fuzz-world-3d/fuzz-world-3d.js" defer type="module"></script>

  <section class="center-align webgpu-missing error-border">
    <img src="/img/webgpu-responsive.svg" width="768" height="768" />
    <p class="error">
      This demo requires <a href="https://en.wikipedia.org/wiki/WebGPU">WebGPU</a> - in other words, you should open this page in Chrome or Edge.
    <p>
  </section>
</section>
