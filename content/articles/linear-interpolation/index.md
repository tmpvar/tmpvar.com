+++
title = "Linear Interpolation"
date = 2023-10-10
[extra]
unlisted = true
enableSampleImage = true
+++

Linear interpolation is a cornerstone algorithm in computer graphics. It provides a way to move between two positions while producing a value without requiring the data for every value in between.

<!-- more -->

```c++
// this is also called mix() in glsl
f32 Lerp1D(f32 start, f32 end, f32 t) {
  return start * (1.0 - t) + end * t;
}
```

## Bilinear Interpolation (2D)

```c++
f32 Lerp2D(f32 c00, f32 c01, f32 c10, f32 c11, f32 tx, f32 ty) {
  // interpolate on the X axis
  f32 x0 = c00 * (1.0 - tx) + c01 * tx; // Lerp1D(c00, c01, tx);
  f32 x1 = c10 * (1.0 - tx) + c11 * tx; // Lerp1D(c10, c11, tx);

  // interpolate on the Y axis
  return = x0 * (1.0 - ty) + x1 * ty;    // Lerp1D(x0, x1, ty);
}
```

## Trilinear Interpolation (3D)

```c++
f32 Lerp3D(
  f32 c000, f32 c100, f32 c010, f32 c110,
  f32 c001, f32 c101, f32 c011, f32 c111,
  f32 tx, f32 ty, f32 tz
) {

  f32 c00 = c000 * (1.0 - tx) + c100 * tx; // Lerp1D(c000, c100, tx)
  f32 c01 = c010 * (1.0 - tx) + c110 * tx; // Lerp1D(c100, c110, tx)
  f32 c10 = c001 * (1.0 - tx) + c101 * tx; // Lerp1D(c001, c101, tx)
  f32 c11 = c011 * (1.0 - tx) + c111 * tx; // Lerp1D(c011, c111, tx)

  f32 c0 = c00 * (1.0 - ty) + c10 * ty;    // Lerp1D(c00, c01, tx)
  f32 c1 = c01 * (1.0 - ty) + c11 * ty;    // Lerp1D(c00, c01, tx)

  return c0 * (1.0 - z) + c1 * tz;         // Lerp1D(c0, c1, tx)

}
```
