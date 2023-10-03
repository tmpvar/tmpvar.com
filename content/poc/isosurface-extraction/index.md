+++
title = "Isosurface Extraction"
date = 2023-09-29
description = "Playground for various isosurface extraction techniques"
+++

## 2D

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
  <script type="module" src="marching-squares.js"></script>
</section>

### Subdivide Dual 2D
<section id="subdivide-dual-2d-content">
  <section class="controls">
  </section>
  <section class="center-align">
    <canvas width="1024" height="1024"></canvas>
  </section>
  <script type="module" src="subdivide-dual-2d.js"></script>
</section>