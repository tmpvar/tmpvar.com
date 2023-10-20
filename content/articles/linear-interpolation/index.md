+++
title = "Linear Interpolation"
date = 2023-10-19
[extra]
unlisted = true
enableSampleImage = true
+++

Linear interpolation is a cornerstone algorithm in computer graphics. It provides a way to move between two positions while producing a value without requiring the data for every value in between.

<!-- more -->

Linear Interpolation is known by a few names:

- [glsl](https://registry.khronos.org/OpenGL-Refpages/gl4/html/mix.xhtml) and [wgsl](https://www.w3.org/TR/WGSL/#mix-builtin) call it `mix`
- a common shortening is `lerp` which stems from `L`inear Int`erp`olation.

Let's start simple with a 1D case, the equation for `lerp` is:

```c
lerp(start, end, t) = start + (1.0 - t) * end * t
```

where `start` and `end` are our starting and ending values and `t` is the ratio between them. `t` is commonly used as a percentage, but is not limited to the 0.0..1.0 range


## Linear Interpolation (1D)
<div id="LinearInterpolation1D-content">

Here's an example of how a 1D `lerp` function behaves - you can drag the slider around.

```c++
f32 Lerp1D(f32 start, f32 end, f32 t) {
  return start * (1.0 - t) + end * t;
}
```

  <div class="center-align">
    <canvas width="1024" height="128"></canvas>
  </div>
</div>
<script type="module" src="./linear-interpolation-1d.js"></script>

## Bilinear Interpolation (2D)

Bilinear interpolation can be computed by performing three 1D interpolations over:

- the bottom corners
- the top corners
- the top and bottom

<div id="LinearInterpolation2D-content">

```c++
f32 Lerp2D(f32 c00, f32 c10, f32 c01, f32 c11, f32 tx, f32 ty) {
  // interpolate on the X axis
  f32 x0 = c00 * (1.0 - tx) + c10 * tx; // Lerp1D(c00, c10, tx);
  f32 x1 = c01 * (1.0 - tx) + c11 * tx; // Lerp1D(c01, c11, tx);

  // interpolate on the Y axis
  return x0 * (1.0 - ty) + x1 * ty;    // Lerp1D(x0, x1, ty);
}
```
  <div class="center-align">
    <canvas width="1024" height="512"></canvas>
  </div>
</div>
<script type="module" src="./linear-interpolation-2d/basic.js"></script>

## Trilinear Interpolation (3D)

Trilinear interpolation works on the values located at the corners of a cube. We can break the problem down again into multiple 1D interpolations:

- front face top edge
- front face bottom edge
- back face top edge
- back face bottom edge
- front-back top
- front-back bottom
- bottom top

```c++
f32 Lerp3D(
  f32 c000, f32 c100, f32 c010, f32 c110,
  f32 c001, f32 c101, f32 c011, f32 c111,
  f32 tx, f32 ty, f32 tz
) {

  // front face
  f32 c00 = c000 * (1.0 - tx) + c100 * tx; // Lerp1D(c000, c100, tx)
  f32 c01 = c010 * (1.0 - tx) + c110 * tx; // Lerp1D(c100, c110, tx)

  // back face
  f32 c10 = c001 * (1.0 - tx) + c101 * tx; // Lerp1D(c001, c101, tx)
  f32 c11 = c011 * (1.0 - tx) + c111 * tx; // Lerp1D(c011, c111, tx)

  f32 c0 = c00 * (1.0 - ty) + c10 * ty;    // Lerp1D(c00, c01, ty)
  f32 c1 = c01 * (1.0 - ty) + c11 * ty;    // Lerp1D(c00, c01, ty)

  return c0 * (1.0 - z) + c1 * tz;         // Lerp1D(c0, c1, tz)
}
```
