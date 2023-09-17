## future
- poc: dual-marching-squares
- article: generating marching cubes lookup tables
- article: sand sim w/ box2d
- article: hashmap-like datastructures
- article: allocators
- article: rawkit postmortem / retrospective
- article: lbvh
- article: hotcart & hotcart redux

## Pending
- radiance-cascades: add slider for level 0 ray count e.g., the number of directions
- radiance-cascades: add the actual values of the sliders
- radiance-cascades: performance timers
- radiance-cascades: march in mips
  https://discord.com/channels/318590007881236480/1142751596858593372/1152840549812944988
- radiance-cascades: cascade 0 doesn't absolutely start at 0
  https://discord.com/channels/318590007881236480/1142751596858593372/1152843885844901928
- radiance-cascades: raytrace approach for comparison's sake



## 2023-09-17
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
