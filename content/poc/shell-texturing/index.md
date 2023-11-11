+++
title = "Shell Texturing"
date = 2023-11-10
+++

## Inspiration

[acerola](https://www.youtube.com/@Acerola_t)'s youtube video [How Are Games Rendering Fur?](https://www.youtube.com/watch?v=9dr-tRQzij4)

<section id="shell-texturing-content" class="has-webgpu">
  <section class="controls">
    <div class="shellCount-control control">
      shell count <input type="range" min="16" max="512" value="64" />
      <output></output>
    </div>
    <div class="shellSpacing-control control">
      shell spacing <input type="range" min="0.001" max="1.0" value="0.04" step="0.001" />
      <output></output>
    </div>
    <div class="shellSubdivisions-control control">
      shell subdivisions <input type="range" min="2" max="1024" value="64" step="1" />
      <output></output>
    </div>
    <div class="mesh-control control">
      mesh
      <select>
        <option value="plane" selected>Plane</option>
        <option value="cube">Cube</option>
        <option value="sphere">Sphere</option>
      </select>
    </div>
  </section>
  <section class="center-align">
    <canvas width="1024" height="1024"></canvas>
    <section class="center-align webgpu-missing error-border">
      <img src="/img/webgpu-responsive.svg" width="768" height="768" />
      <p class="error">
        This demo requires <a href="https://en.wikipedia.org/wiki/WebGPU">WebGPU</a> - in other words, you should open this page in Chrome or Edge.
      <p>
    </section>
  </section>
  <script src="shell-texturing.js" type="module"></script>
  <p>
    source: <a href="shell-texturing.js" target="_blank">shell-texturing.js</a>
  </p>

</section>