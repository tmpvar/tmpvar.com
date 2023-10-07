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
            <option value="dual-contouring">Dual Contouring</option>
            <!-- <option value="surface-nets">Surface Nets (WIP)</option> -->
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

### Marching Squares
<section id="marching-squares-content">
  <section class="controls">
    <div class="cellDiameter-control control">
      cell diameter: <input type="range" min="2" max="9" value="7">
      <output></output>
    </div>
    <div class="epsilon-control control">
      epsilon: <input type="range" min="0.1" max="10" value="0.5" step="0.1">
      <output></output>
    </div>
    <div class="isolevel-control control">
      isolevel: <input type="range" min="-500" max="500" value="0.0" step="0.1">
      <output></output>
    </div>
    <div class="subdivideWhileCollectingLoops-control control">
      subdivide while collecting loops<input type="checkbox" value="1" checked />
    </div>
    <section class="indent">
      <div class="subdivideWhileCollectingLoopsMaxSubdivisions-control control">
        max subdivisions: <input type="range" min="0" max="100" value="10">
        <output></output>
      </div>
      <div class="subdivideWhileCollectingLoopsUseSegmentBisector-control control">
        while subdividing, try to use the segment normal<input type="checkbox" value="1" checked />
      </div>
      <div class="subdivideWhileCollectingLoopsUseBestCagePoint-control control">
        control the length of the segment bisector by the nearest cage point<input type="checkbox" value="1" />
      </div>
    </section>
  </section>
  <section class="center-align">
    <canvas width="1024" height="1024"></canvas>
  </section>
  <script type="module" src="old-marching-squares.js"></script>
</section>

### Subdivide 2D
<section id="subdivide-2d-content">
  <section class="controls">
    <h4>Debug</h4>
    <div class="indent">
      <div class="debugDrawNodeIndex-control control">
        <input type="checkbox" value="1" checked />
        <label>draw node index</label>
      </div>
      <div class="debugDrawNodeCornerState-control control">
        <input type="checkbox" value="1" /> draw node corner state
      </div>
      <div class="debugDrawDualGraph-control control">
        <input type="checkbox" value="1" /> draw dual graph
      </div>
      <div class="maxExtractionSteps-control control">
        <input type="range" min="-1" max="5000" value="-1"> max contour extraction steps =
        <output></output>
      </div>
    </div>
    <h4>Params</h4>
    <div class="indent">
      <div class="maxDepth-control control">
        <input type="range" min="0" max="15" value="5"> max subdivision depth =
        <output></output>
      </div>
      <div class="isolevel-control control">
        <input type="range" min="-500" max="500" value="0.0" step="0.1"> isolevel =
        <output></output>
      </div>
      <div class="contourExtractionApproach-control control">
        <select>
            <option value="marching-squares">Marching Squares</option>
            <option value="dual-contouring">Dual Contouring</option>
        </select>
        contour extraction approach
        <output></output>
      </div>
    </div>
  </section>
  <section class="center-align">
    <canvas width="1024" height="1024"></canvas>
  </section>
  <script type="module" src="old-subdivide.js"></script>
</section>