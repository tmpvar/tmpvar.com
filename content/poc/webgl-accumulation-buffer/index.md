+++
title = "WebGL Accumulation Buffer"
date = 2024-02-22
+++

# Reasoning

I wanted to do a basic little demo like one would in canvas when it first came out. The idea is that on every frame you paint over the previous frame with a low opacity black/background color and then paint the new stuff on top. This gives moving particles a trail. Intentional (classy?) motion blur might be another way to put it.

<section id="webgl-accumulation-buffer-content">
  <section class="center-align">
    <canvas width="1024" height="1024"></canvas>
  </section>
  <script src="webgl-accumulation-buffer.js" type="module"></script>
  <p>
    source: <a href="webgl-accumulation-buffer.js" target="_blank">webgl-accumulation-buffer.js</a>
  </p>
</section>