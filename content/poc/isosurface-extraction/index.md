+++
title = "Isosurface Extraction"
date = 2023-09-29
description = "Playground for various isosurface extraction techniques"
+++

## 2D

### Marching Squares
<section id="isosurface-extraction-2d-content">
  <section class="controls">
    <div class="cellDiameter-control control">
      cell diameter: <input type="range" min="2" max="9" value="7">
      <output></output>
    </div>
    <div class="subdivideWhileCollectingLoops-control control">
      subdivide while collecting loops<input type="checkbox" value="1" checked />
    </div>
    <div class="subdivideWhileCollectingLoopsMaxSubdivisions-control control">
      max subdivisions: <input type="range" min="0" max="100" value="10">
      <output></output>
    </div>
  </section>
  <section class="center-align">
    <canvas width="1024" height="1024"></canvas>
  </section>
  <script type="module" src="isosurface-extraction-2d.js"></script>
</section>
