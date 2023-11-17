+++
title = "Implementing Radiance Cascades"
date = 2023-10-10

[extra]
unlisted = true
enableSampleImage = false
+++

Notes and issues that I experienced while implementing Radiance Cascades

<!-- more -->

## Notes



### Flatland

### Screen Space Probes

Coming into this, I have no idea how screen space probes are supposed to work.

If I had to guess, you render the scene and then break up the screen into a uniform
probe distribution, much like 2d.

Guesses about how rays are cast

- screen space: march the depth buffer
- world space: move the probe to the surface under the pixel


#### Volume transfer function

https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-39-volume-rendering-techniques

Opacity Correction

`A = 1 - (1 - A_0) ^ (s_0 / s)`

### World Space (3D)

- the memory requirements are very high