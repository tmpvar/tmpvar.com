+++
title = "Isosurface Extraction"
date = 2023-09-29
description = "Playground for various isosurface extraction techniques"
+++

## 2D

<section id="isosurface-extraction-2d-content">
  <section class="controls">
    <h4>Debug</h4>
    <div class="indent">
      <div class="debugDrawNodeCornerState-control control">
        <input type="checkbox" value="1" /> draw boundary cell corner state
      </div>
      <div class="debugDrawNodeEdgeState-control control">
        <input type="checkbox" value="1" /> draw boundary cell edge state
      </div>
      <div class="debugDrawLooseEdgeVertices-control control">
        <input type="checkbox" value="1" /> draw loose edge vertices
      </div>
      <div class="debugDrawBoundaryCells-control control">
        <input type="checkbox" value="1" /> draw boundary cells
      </div>
      <div class="debugDrawGrid-control control">
        <input type="checkbox" value="1" checked /> draw grid
      </div>
      <div class="debugDrawCellTextualInfo-control control">
        <input type="checkbox" value="1" /> draw cell textual info
      </div>
      <div class="debugLoopCollectionMaxSteps-control control">
        <input type="range" min="-1" max="500" value="-1"> max loop collection steps
        <output></output>
      </div>
      <div class="epsilon-control control">
        <input type="range" min="0.001" max="10" value="0.01" step="0.001"> epsilon
        <output></output>
      </div>
    </div>
    <h4>Params</h4>
    <div class="indent">
      <div class="debugPerformance-control control">
        <input type="checkbox" value="1" checked> show timings
        <div class="performance-output shownBy-debugPerformance">
          timings
          <code><pre></pre></code>
        </div>
      </div>
      <div class="isolevel-control control">
        <input type="range" min="-500" max="500" value="0.0" step="0.1"> isolevel
        <output></output>
      </div>
      <div class="lineSearchMaxSteps-control control">
        <input type="range" min="0" max="100" value="20"> line search max steps
        <output></output>
      </div>
      <div class="contourExtractionApproach-control control">
        <select>
            <option value="marching-squares">Marching Squares</option>
            <option value="dual-contouring">🚧 Dual Contouring 🚧</option>
            <option value="surface-nets">🚧 Surface Nets 🚧</option>
        </select>
        contour extraction approach
      </div>
      <div class="performSubdivision-control control">
        <input type="checkbox" value="1" checked >
        subdivide
      </div>
      <div class="cellDiameter-control control hiddenBy-performSubdivision">
        <input type="range" min="2" max="9" value="3"> cell diameter
        <output></output>
      </div>
      <div class="maxSubdivisionDepth-control control shownBy-performSubdivision">
        <input type="range" min="2" max="12" value="8"> max subdivision depth
        <output></output>
      </div>
    </div>
  </section>
  <section class="center-align">
    <canvas width="1024" height="1024"></canvas>
  </section>
  <script type="module" src="2d/isosurface-extraction-2d.js"></script>
</section>


## Interpolated Isosurface Viz (3D)
<section id="interpolated-isosurface-viz-3d-content" class="has-webgpu">
  <section class="controls webgpu-required">
    <h4>Debug/Development</h4>
    <div class="indent">
      <div class="debugRenderStepCount-control control">
        render step count <input type="checkbox" value="1" />
      </div>
      <div class="debugRenderSolid-control control">
        render solid <input type="checkbox" value="1" />
      </div>
    </div>
    <h4>Scene</h4>
    <div class="indent">
      <div class="scene-control control">
        <select>
          <option value="time-varying" selected>Time Varying</option>
          <option value="manual">Manual</option>
        </select>
      </div>
      <div class="shownBy-scene indent" showValue="manual">
        <div class="c000-control control">
          (0, 0, 0): <input type="range" min="-2.0" max="2.0" value="2.0" step="0.01">
          <output></output>
        </div>
        <div class="c001-control control">
          (1, 0, 0): <input type="range" min="-2.0" max="2.0" value="-2.0" step="0.01">
          <output></output>
        </div>
        <div class="c010-control control">
          (0, 1, 0): <input type="range" min="-2.0" max="2.0" value="-1.76" step="0.01">
          <output></output>
        </div>
        <div class="c011-control control">
          (1, 1, 0): <input type="range" min="-2.0" max="2.0" value="0.51" step="0.01">
          <output></output>
        </div>
        <div class="c100-control control">
          (0, 0, 1): <input type="range" min="-2.0" max="2.0" value="-0.97" step="0.01">
          <output></output>
        </div>
        <div class="c101-control control">
          (1, 0, 1): <input type="range" min="-2.0" max="2.0" value="0.7" step="0.01">
          <output></output>
        </div>
        <div class="c110-control control">
          (0, 1, 1): <input type="range" min="-2.0" max="2.0" value="2.0" step="0.01">
          <output></output>
        </div>
        <div class="c111-control control">
          (1, 1, 1): <input type="range" min="-2.0" max="2.0" value="-0.28" step="0.01">
          <output></output>
        </div>
      </div>
    </div>
    <h4>Approach</h4>
    <div class="indent">
      <div class="approach-control control">
        <select>
          <option value="fixed-step-ray-march" selected>Fixed Step Raymarch</option>
          <!-- <option value="segment-marching">🚧 Segment Marching 🚧</option> -->
          <option value="ray-tracing-signed-distance-grids">🚧 Ray Tracing Signed Distance Grids 🚧</option>
        </select>
        <div class="shownBy-approach indent" showValue="fixed-step-ray-march">
          <div class="maxFixedSteps-control control">
            max fixed steps: <input type="range" min="10.0" max="1000.0" value="200.0" step="1.0">
            <output></output>
          </div>
        </div>
      </div>
    </div>
  </section>
  <section class="center-align webgpu-required">
    <canvas width="1024" height="1024"></canvas>
  </section>
  <script type="module" src="interpolated-isosurface-viz-3d/interpolated-isosurface-viz-3d.js"></script>
  <section class="center-align webgpu-missing error-border">
    <img src="/img/webgpu-responsive.svg" width="768" height="768" />
    <p class="error">
      This demo requires <a href="https://en.wikipedia.org/wiki/WebGPU">WebGPU</a> - in other words, you should open this page in Chrome or Edge.
    <p>
  </section>
</section>