## future
- poc: dual-marching-squares
- article: generating marching cubes lookup tables
- article: sand sim w/ box2d
- article: hashmap-like datastructures
- article: allocators
- article: rawkit postmortem / retrospective
- article: lbvh
- article: hotcart & hotcart redux
- article: pullstream
- radiance-cascades/2d: raytrace approach for comparison's sake
- radiance-cascades/2d: add a ring of probes along the outside of the bounds to correctly sample
                     upper probes from lower probes that live on the edge
                     (e.g., outside of a fully valid bilinear interpolation cage)
- radiance-cascades/2d: consider replacing "run continuously" with a play button, like shadertoy
- radiance-cascades/2d: consider adding an environment light to the 2d demo
- radiance-cascades/2d: consider adding a dumb FPS counter when the "run continuously" without
                     timer queries

## Pending
- radiance-cascades/2d: when computing fluence, how does the alpha channel affect the result?
- radiance-cascades/2d: 'proper' transparency accumulation
- radiance-cascades/2d: how to fix the ringing artifacts?

## 2023-09-20
- radiance-cascades/2d: add dom output for timings
- radiance-cascades/2d: ~~add a screenshot button~~ currently not possible
- radiance-cascades/2d: fix 'debug probe directions'
- radiance-cascades/2d: change `Probe RayDDA` to Flatland and update all links in the channel
                     opted to add a span with an id to allow the old link to work
- radiance-cascades/2d: interpolate fluence on a per pixel basis (bilinear interpolation)
- radiance-cascades/2d: add a separate raymarching approach that does constant sized steps
- radiance-cascades/2d: add another debug flag that flips between dda and constant sized stepping
## 2023-09-19
- radiance-cascades/2d: default demo world
- radiance-cascades/2d: cascade 0 doesn't absolutely start at 0
                      https://discord.com/channels/318590007881236480/1142751596858593372/1152843885844901928
- radiance-cascades/2d: fix the embed image!
- radiance-cascades/2d: add fallback messaging for browsers without webgpu support turned on
                     draw up a pixelated webgpu image that I can just dump into the canvas
- radiance-cascades/2d: march in mips and accumulate using transparency
  https://discord.com/channels/318590007881236480/1142751596858593372/1152840549812944988
- radiance-cascades/2d: compute world texture mipmaps
## 2023-09-17
- radiance-cascades/2d: performance timers + option to run continuously
- radiance-cascades/2d: add slider for level 0 ray count e.g., the number of directions
- radiance-cascades/2d: add the actual values of the sliders
## 2023-09-16
- radiance-cascades/2d: fix demos such that branching factor does not affect spatial resolution.
                     It should remain a 2x jump at every level.
- radiance-cascades/2d: brush preview
- radiance-cascades/2d: add clear button
- radiance-cascades/2d: add a toggle for 2^N rays vs 4^N rays and sample 4 upper rays when merging
- radiance-cascades/2d: make radiance a float and allow it to go past 1.0
## 2023-09-15
- radiance-cascades/2d: fix angle between next cascade - was offsetting the upper sample by the ray offset
- radiance-cascades/2d: make intervalRadius start where the previous one left off
- radiance-cascades/2d: fix demos to cast rays in the correct directions!
