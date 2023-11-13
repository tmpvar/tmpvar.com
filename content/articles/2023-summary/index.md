+++
title = "2023 summary"
date = 2023-12-31

[extra]
unlisted = true
enableSampleImage = false
+++

I spent a large portion of this year digging deeper into graphics programming concepts.

- sdf-editor

## January

A the start of the year I was working on the sdf-editor and not a ton of context was saved because I didn't have this website and I wanted the results to be a surprise. This was a huge mistake, I need to get better at showing progress externally.

[parse tree w/ grouping](https://discord.com/channels/354027975412416523/354027975412416524/1069771189226057759)

<div class="center-align">
  <img width="90%" alt="sdf-editor group based cut bug" src="assets/sdf-editor-1/cut-bug.png" />
</div>

<div class="center-align">
  <img width="90%" alt="sdf-editor group based cut bug fixed" src="assets/sdf-editor-1/cut-bug-fixed.png" />
</div>

- more register based musings

<div class="center-align">
  <img alt="sdf-editor group register machine thinking" width="90%" src="assets/sdf-editor-1/register-machine-thinking.png" />
</div>

Suffered from a simple [change](https://discord.com/channels/354027975412416523/354027975412416524/1073131427874488330) (adding a couple properties) that ballooned into larger refactor. The problem was that there is no easy way to find all of the places a property needs to be referenced or copied. This refactor moved me towards using non-optional `switch()` statements that force every `enum` to be present. This adds more code, but atleast adding a propery that needs to be plumbed through the system will cause compile time errors instead of having to find all of the issues at runtime.

## Februrary

I needed a distration and happened to watch a Pezza's work video [Writing a Physics Engine from scratch - collision detection optimization](https://www.youtube.com/watch?v=9IULfQH7E90) where they show a very large number of particles interacting. I got nerd sniped!

<div class="center-align">
  <img width="90%" src="assets/particle-physics/first-step.png" />
  <br />
  <code><pre>~14ms for 1300 particles, ew!</pre></code>
</div>

<div class="center-align">
  <img width="90%" src="assets/particle-physics/10k-at-20ms.png" />
  <br />
  <code><pre>~20ms for 10,000 particles by reducing the grid size and </pre></code>
</div>

<div class="video-embed" style="position: relative; padding-top: 55.05735140771637%;">
  <iframe
    src="https://customer-vv39d21derhw1phl.cloudflarestream.com/a4bbc8d006ccff65b06facb910a050e7/iframe?preload=true&poster=https%3A%2F%2Fcustomer-vv39d21derhw1phl.cloudflarestream.com%2Fa4bbc8d006ccff65b06facb910a050e7%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600"
    style="border: none; position: absolute; top: 0; left: 0; height: 100%; width: 100%;"
    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
    allowfullscreen="true"
  ></iframe>
</div>

<div class="center-align">
  <code>
    <pre>~10ms for 40,000 particles by building the grid once per frame and using AVX2
    on a single thread</pre>
  </code>
</div>

And then it was back to the sdf-editor, which I was working on in parallel with the particle sim.

## March

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-1/panel-fields-multiselection.png" />
  <br />
  <code><pre>making the panel handle multi-select</pre></code>
</div>

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-1/bike-4.png" />
  <br />
  <code><pre>pre-alpha user testing
  takeaway: this thing is pretty hard to use</pre></code>
</div>


<div class="video-embed" style="position: relative; padding-top: 56.25%;">
  <iframe
    src="https://customer-vv39d21derhw1phl.cloudflarestream.com/f34dab03c2447d56d367df2462ba9fab/iframe?preload=true&poster=https%3A%2F%2Fcustomer-vv39d21derhw1phl.cloudflarestream.com%2Ff34dab03c2447d56d367df2462ba9fab%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600"
    style="border: none; position: absolute; top: 0; left: 0; height: 100%; width: 100%;"
    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
    allowfullscreen="true"
  ></iframe>
</div>

Some things were wearing on me with the sdf editor

1. Objects were limited to the size of the voxel box they were contained in. I believe this was 512<sup>3</sup>
2. In my user testing people found it hard to manipulate objects
3. After ~200 objects everything became laggy
4. The elephant in the room: composite brushes made it much more complex to optimize the evaluator, re-enforcing the
   200 object limit.
5. Controls / Panel were somewhere inbetween direct manipulation and precise control like you'd see in CAD, but it did
   neither very well. I think there is room in an editor to do both, but I missed the mark on this one.

So, I scrapped the whole thing and started designing a new system that wouldn't be forced to live inside of a voxel grid. My first thought was of panic because living on a grid is comfy. You don't have to worry about isosurface extraction and all of the degeneracies (e.g., topological issues, manifold issues) or the optimization of connecting graphs together to save on vertex bandwidth.

So after taking another glance at the current state of the art which seemed like [Digital Surface Regularization With Guarantees](https://www.computer.org/csdl/journal/tg/2021/06/09339892/1qLhYrSA4ve), I noticed that in their paper they have missing triangles!

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/digital-surface-regularization-with-guarantees-missing-triangles.png" />
</div>

Anyway, I watched Alex Evan's [Learning From Failure](https://www.youtube.com/watch?v=u9KNtnCZDMI) talk again and though I'd give max-norm a try. One thing that I thought would be a showstopper is if I couldn't figure out how evaluate objects that had been rotated under the max-norm distance metric.

According to [Simon Brown](https://mastodon.gamedev.place/@sjb3d) the distance metric for a rotated object is the same as finding the largest aligned cube within a unit rotated cube (see: the [Max norm ellipsoid](https://www.shadertoy.com/view/Mt2XWG) shadertoy).

So I gave that a shot and came up with these two things:

- 2D: [fit a unit square into a rotate unit square on desmos](https://www.desmos.com/calculator/2syevc7h9f)
- 3D: [fit a axis aligned cube inside of a rotated unit cube](https://observablehq.com/d/9a7594f28c8983da)

- TODO: I made these before this website was launched, so it would be beneficial to port them over

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/basic-euclidean-single-thread.png" />
  <br />
  <code><pre>A plane of rotated boxes
  Euclidean single thread 1223ms boxes(561) steps(14794498) leaves(4056562)</pre></code>
</div>

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/basic-max-norm-single-thread.png" />
  <br />
  <code><pre>A plane of rotated boxes
  MaxNorm single thread 1037ms boxes(561) steps(14090824) leaves(3812840)</pre></code>
</div>

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/basic-plane-of-boxes-and-spheres-single-thread.png" />
  <br />
</div>
  Things were pretty speedy under a release build
  <code><pre>scene(plane of boxes and spheres)
  Euclidean/Scalar single thread 186ms primitives(561) steps(22517064) leaves(6307840)
  Euclidean/IntervalArithmetic single thread 386ms primitives(561) steps(20804936) leaves(5726208)
  MaxNorm single thread 291ms boxes(561) steps(20804936) leaves(5726208)
  <br />
scene(plane of rotated boxes)
  Euclidean/Scalar single thread 211ms primitives(561) steps(14793252) leaves(4055356)
  Euclidean/IntervalArithmetic single thread 1053ms primitives(561) steps(19905185) leaves(5364673)
  MaxNorm single thread 167ms boxes(561) steps(14089012) leaves(3811412)</pre></code>
</p>

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/evaluator-musings.jpg" />
</div>

After a brief stint writing a gpu evaluator, I turned my focus back to CPU evaluation because it is more general purpose. It is easier to run headless and on older machines. At this point the major downside of the evaluator is that it still operated over a fixed sized grid, building an octree. However, the multithreaded octree building approach that I was considering for the GPU scared me into avoiding it on the CPU.

Instead I came up with the notion of having each thread running over an implicit grid, filtering primitives based on the grid cell and if there were overlaps then the thread subdivides the cell recursively to find the leaves. On the cpu this makes a ton of sense because we have large caches and stacks are basically free. By limiting the size of the chunks we also limit the depth of the traversal which makes tuning this with a single knob possible.

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/chunker-first.png" />
  <code><pre>The Chunker<sup>TM</sup></pre></code>
</div>

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/chunker-first-graph-colored.png" />
  <code><pre>identifying the chunks associated with regions of the sphere</pre></code>
</div>


<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/chunker-box-of-rotated-boxes.png" />
  <code><pre>box of rotated boxes</pre></code>
</div>


<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/chunker-no-world-size-limits.png" />
  <code><pre>finally I've broken free of world size limits</pre></code>
</div>

At this point things were working pretty well, but my meshing strategy was a mess. Each chunk was being meshed, and since we don't know whats going on in the neighborhood (without dependency tracking or some other complexity) the mesher would mesh the inside and the outside of the isosurface. This effectively means that we're paying double the cost for meshing and double the cost for rendering.

To improve on this I thought back to one of many invaluable tips that [Sebastian Aaltonen](https://twitter.com/SebAaltonen) mentioned on twitter about [generating cube vertices in a vertex shader](https://twitter.com/SebAaltonen/status/1322594445548802050). By implementing this I was able to reduce the meshing time by ~80% (354ms -> 81ms) and the rendering time by ~60% (40ms -> 16ms) for 15 million leaves!

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/vertex-pulling.png" />
</div>

Now, the next thing bugging me was my lack of understand of how the evaluator was working in the octree. It still wasn't super fast, but I didn't have any data to inform how to optimize. So I decided to shine some light on what the evaluator was doing at each level of the octree by aggregating the data into a histogram.

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/evaluator-histogram.png" />
  <code><pre>Chunker histogram</pre></code>
</div>

At level 0, the prims per cell is the highest, but this ratio quickly drops down and we end up swapping from performing many primitive evaluations per cell to many cell evaluations against very few primitives.

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/chunker-avx512.png" />
  <code><pre>4x faster with very basic avx512 usage
  Prefiltering primitive bounding boxes against the chunks</pre></code>
</div>

Initially I wrote the visualization side of the evaluator as just a way to debug what it was doing. As things progressed and I added more and more functionality to it, I realized that this thing was actually fast enough to use interactively.

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/g-buffer.png" />
  <code><pre>added g-buffer support</pre></code>
</div>

Now that I had a g-buffer, we turn once again to Sebbbi's twitter, this time for [Hi-Z Culling](https://twitter.com/SebAaltonen/status/1610302009692798979). The basic idea is that you use the previous frame's depth buffer to cull objects in the current frame that would be behind last frame's objects.

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/hi-z.png" />
  <code><pre>hi-z culling from <a href="https://advances.realtimerendering.com/s2015/aaltonenhaar_siggraph2015_combined_final_footer_220dpi.pdf">GPU-Driven Rendering Pipelines
</a></pre></code>
</div>

Results:

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/before-hzb.png" />
  <code><pre>before hi-z culling: 16ms per frame</pre></code>
</div>

<div class="center-align">
  <img width="90%" src="assets/sdf-editor-2/after-hzb.png" />
  <code><pre>after hi-z culling: 3.6ms per frame</pre></code>
</div>

## April

## May

## June

## July

### Wave Function Collapse

<div class="center-align">
  <img width="90%" src="assets/wave-function-collapse/spice-weasel-first.png" />
  <img width="90%" src="assets/wave-function-collapse/tmpvar-first.png" />
  <img width="90%" src="assets/wave-function-collapse/spice-weasel-spiral.png" />
  <img width="90%" src="assets/wave-function-collapse/spice-weasel-7.png" />
  <img width="90%" src="assets/wave-function-collapse/tmpvar-mono.png" />
  <img width="90%" src="assets/wave-function-collapse/spice-weasel-snakes.png" />
  <img width="90%" src="assets/wave-function-collapse/spice-weasel-red-roofed-village.png" />
  <img width="90%" src="assets/wave-function-collapse/tmpvar-forest-beach-land.png" />
</div>



## August

## September

## October

## November