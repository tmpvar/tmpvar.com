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
- radiance-cascades: raytrace approach for comparison's sake
- radiance-cascades: add a ring of probes along the outside of the bounds to correctly sample
                     upper probes from lower probes that live on the edge
                     (e.g., outside of a fully valid bilinear interpolation cage)
- radiance-cascades: consider replacing "run continuously" with a play button, like shadertoy
- radiance-cascades: consider adding an environment light to the 2d demo

## Pending
- radiance-cascades: add a separate raymarching approach that does constant sized steps
- radiance-cascades: when computing fluence, how does the alpha channel affect the result?

- radiance-cascades: interpolate fluence on a per pixel basis
- radiance-cascades: consider adding a dumb FPS counter when the "run continuously" without
                     timer queries
- radiance-cascades: add dom output for timings
- radiance-cascades: change `Probe RayDDA` to Flatland and update all links in the channel

## 2023-09-20
- radiance-cascades: add another debug flag that flips between dda and constant sized stepping
## 2023-09-19
- radiance-cascades: default demo world
- radiance-cascades: cascade 0 doesn't absolutely start at 0
                      https://discord.com/channels/318590007881236480/1142751596858593372/1152843885844901928
- radiance-cascades: fix the embed image!
- radiance-cascades: add fallback messaging for browsers without webgpu support turned on
                     draw up a pixelated webgpu image that I can just dump into the canvas
- radiance-cascades: march in mips and accumulate using transparency
  https://discord.com/channels/318590007881236480/1142751596858593372/1152840549812944988
- radiance-cascades: compute world texture mipmaps
## 2023-09-17
- radiance-cascades: performance timers + option to run continuously
- radiance-cascades: add slider for level 0 ray count e.g., the number of directions
- radiance-cascades: add the actual values of the sliders
## 2023-09-16
- radiance-cascades: fix demos such that branching factor does not affect spatial resolution.
                     It should remain a 2x jump at every level.
- radiance-cascades: brush preview
- radiance-cascades: add clear button
- radiance-cascades: add a toggle for 2^N rays vs 4^N rays and sample 4 upper rays when merging
- radiance-cascades: make radiance a float and allow it to go past 1.0
## 2023-09-15
- radiance-cascades: fix angle between next cascade - was offsetting the upper sample by the ray offset
- radiance-cascades: make intervalRadius start where the previous one left off
- radiance-cascades: fix demos to cast rays in the correct directions!
