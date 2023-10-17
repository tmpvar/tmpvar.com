## future
- marching-squares: instead of line searching to the nearest cage point
                    maybe circle marching would be a better way to avoid crossing
                    multiple iso lines
- poc: dual-marching-squares
- radiance-cascades/2d: raytrace approach for comparison's sake
- radiance-cascades/2d: add a ring of probes along the outside of the bounds to correctly sample
                     upper probes from lower probes that live on the edge
                     (e.g., outside of a fully valid bilinear interpolation cage)
- radiance-cascades/2d: consider replacing "run continuously" with a play button, like shadertoy
- radiance-cascades/2d: consider adding an environment light to the 2d demo
- radiance-cascades/2d: consider adding a dumb FPS counter when the "run continuously" without
                     timer queries
- radiance-cascades/3d: add touch events when webgpu works on any mobile device
- radiance-cascades/3d: texture wrapper that tracks version
                        will be used for resizing the
                        volume via a slider, and we'll want to rebuild the bindGroup when
                        that happens
- radiance-cascades/2d: collect all of the images and bugs into the radiance cascades 'lessons learned' section
- radiance-cascades/2d: when computing fluence, how does the alpha channel affect the result?
- radiance-cascades/2d: 'proper' transparency accumulation
- radiance-cascades/2d: suslik's blend between cascades - causes light leaks
- radiance-cascades/2d: how to fix the ringing artifacts?

## Next
- let controls live next to the canvas so you dont have to scroll up and down
- only show side controls when the window is wide enough to handle them.
- radiance-cascades/3d: render an analytic primitive

## Pending
- isosurface-extraction/sphere-march-cube: sphere march from surface into the cube given the
                                           corner values

- radiance-cascades/3d: add scene specific params and process them
- radiance-cascades/3d: add raymarching approach: Brute Force World Space
- radiance-cascades/3d: add raymarching approach: Cascades Screen Space Raymarch
- radiance-cascades/3d: add raymarching approach: Cascades World Space RayMarch

- radiance-cascades/3d: collect depth buffer and mipmap it into a
                        red/green (min/max) f32 texture
- radiance-cascades/3d: trace screen space rays through hiz texture

## 2023-10-16
- isosurface-extraction/sphere-march-cube: draw interpolated distance on the surface
- isosurface-extraction/sphere-march-cube: render a cube on the screen w/ orbit camera
- radiance-cascades/3d: cast rays over a hemisphere
- radiance-cascades/3d: cast rays over an entire sphere
## 2023-10-15
- radiance-cascades/3d: smooth out distance and rotation in orbit camera
- radiance-cascades/3d: move brute force screen space approach into its own little hidy hole
- radiance-cascades/3d: add approach specific params and process them
- radiance-cascades/3d: allow param reader to be scoped
- radiance-cascades/3d: add a toggle for screenspace vs worldspace ray casting
## 2023-10-14
- radiance-cascades/3d: fixup BFSS so that performance can be adjusted and improve overall
                        quality. In other words, make it actually brute force.
## 2023-10-13
- radiance-cascades/3d: add raymarching approach: Brute Force Screen Space
## 2023-10-12
- radiance-cascades/3d: compute the per-pixel normals and output into a separate texture
- radiance-cascades/3d: add fluence debug output
## 2023-10-11
- radiance-cascades/3d: add raymarching approach selector
- radiance-cascades/3d: add multiple, switchable scenes
- radiance-cascades/3d: add an 'infinite' floor box
## 2023-10-10
- radiance-cascades/3d: output object id into texture (red uint16)
- radiance-cascades/3d: render a mesh
- radiance-cascades/3d: add machinery to instance and position objects around the scene
- radiance-cascades/3d: generate and render a cube mesh
- radiance-cascades/3d: generate and render a sphere mesh
- radiance-cascades/3d: create a mesh rendering pipeline
- radiance-cascades/3d: begin a demo for a screenspace probe approach
- radiance-cascades/2d: rename irradiance to fluence
## 2023-10-06
- isosurface-extraction/2d: merge marching squares and subdivision
                            process:
                            1. collect boundary cells
                            2. build traversal map (e.g., node->node mapping for 4 edges)
                            3. traverse the boundary cells collecting a contour using
                               the user selected approach
- isosurface-extraction/2d: create an edges list (cellCount * 4) and use
                            FaceProc from keeter to populate only the containsContour
                            leaf cells
## 2023-10-05
- isosurface-extraction/2d: use sjb3d's floating point sign flip test to avoid the -0 case
- isosurface-extraction/2d: make it easier to hide/show controls based on other control state
- radiance-cascades: convert #flatland-2d-controls to `.controls`
## 2023-09-28
- radiance-cascades/3d: re-enable level 0 ray count, but based on 6 instead of 8
                        __this causes the gpu to crash when set to anything other than 6__
## 2023-09-27
- radiance-cascades/3d: ensure the branching factor is correct
- radiance-cascades/3d: find a better ray distribution function
## 2023-09-26
- radiance-cascades/3d: merge upper cascade
- radiance-cascades/3d: trace cascade N probe rays, collecting into probe buffer
- radiance-cascades/3d: add albedo texture (rgb8) so we can color objects separate
                        to their emissive value (e.g., white smoke without emission)
- radiance-cascades/3d: compute fluence texture
- radiance-cascades/3d: trace cascade 0 probe rays, collecting into probe buffer
- radiance-cascades/3d: compute fluence on occupied cells only + toggle
- radiance-cascades/3d: raymarch primary rays through the fluence texture
## 2023-09-25
- radiance-cascades/3d: add probe buffer
- radiance-cascades/3d: fix t so that it always starts at 0.0
- radiance-cascades/3d: cone trace the volume
- radiance-cascades/3d: mipmap volume
## 2023-09-24
- radiance-cascades/3d: fill 3d volume with data - a fractal from jb
- radiance-cascades/3d: create a 3d volume texture (rgba16float) and fill with some primitives
- radiance-cascades/3d: raymarch 3d volume from the screen
## 2023-09-23
- radiance-cascades/3d: fuzz world, trace rays against volume bounding box
- radiance-cascades/3d: setup another webgpu instance (Fuzz World 3D)
- radiance-cascades/3d: playground: ~~wire up wasd / arrow rotate controls~~
                        this has to be done at the document level which means it will effect all
                        demos.
- radiance-cascades/3d: playground: wire up mouse to rotate/zoom controls
## 2023-09-22
- radiance-cascades/3d: playground: ray distribution add multiple levels
- radiance-cascades/3d: playground: ray distribution on a single probe for a single level
- radiance-cascades/3d: build orbit camera
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
