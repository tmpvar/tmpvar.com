+++
title = "Rendering Interactive Graphics in Kitty"
date = 2020-04-01
+++

Using [kitty](https://sw.kovidgoyal.net/kitty/)'s graphics protocol, one can quickly build visualizations and interactive demos.

<!-- more -->

## Implementation

[graphical-term-util.h](assets/graphical-term-util.h)

## Usage

`gradient-test.cpp`

```cpp
#include <stdio.h>
#include <time.h>

#include "graphical-term-util.h"

int
main() {
  GraphicalTermState *state = (GraphicalTermState *)malloc(sizeof(GraphicalTermState));
  GraphicalTermStart(state);
  GraphicalTermHideTextualCursor(state);

  bool done = false;
  while (!done) {
    GraphicalTermFrameBegin(state);
    if (GraphicalTermIsKeyDown(state, GTKEY_ESCAPE)) {
      done = true;
    }

    // only clear + draw when there is an active framebuffer
    if (state->framebufferPending) {
      // Clear
      int totalPixels = state->framebuffer.width * state->framebuffer.height;
      for (int i = 0; i < totalPixels; i++) {
        state->framebuffer.ptr[i] = 0xFFFF00FF;
      }

      GraphicalTermMoveCursorHome();

      fprintf(stderr,
              "mouse (%u, %u) buttons(%u) size(%u, %u)",
              state->mouse.x,
              state->mouse.y,
              state->mouse.buttons,
              state->framebuffer.width,
              state->framebuffer.height);

      // Draw a red/green gradient across the entire framebuffer
      for (int y = 0; y < state->framebuffer.height; y++) {
        int yoff = y * state->framebuffer.width;
        for (int x = 0; x < state->framebuffer.width; x++) {
          int red = int(float(x) / float(state->framebuffer.width) * 255.0f);
          int green = int(float(y) / float(state->framebuffer.height) * 255.0f);
          state->framebuffer.ptr[yoff + x] = 0xFF000000 | (red & 0xFF) |
                                             ((green & 0xFF) << 8);
        }
      }
    }

    GraphicalTermFrameEnd(state);
  }

  GraphicalTermStop(state);
  free(state);
  return 0;
}
```

Running this via the approach seen in [Using C/C++ as a scripting language (Part 1)](/articles/c-as-a-scripting-language-part-1/)
```bash
c gradient-test.cpp
```

<div class="video-embed" style="position: relative; padding-top: 56.25%;">
  <iframe
    src="https://customer-vv39d21derhw1phl.cloudflarestream.com/79cd888b65b83ff2956426be856460da/iframe?poster=https%3A%2F%2Fcustomer-vv39d21derhw1phl.cloudflarestream.com%2F79cd888b65b83ff2956426be856460da%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600&letterboxColor=transparent&preload=true"
    style="border: none; position: absolute; top: 0; left: 0; height: 100%; width: 100%;"
    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
    allowfullscreen="true"
  ></iframe>
</div>

## Inspiration

- [twitter/@thingskatedid](https://twitter.com/thingskatedid/status/1316074032379248640) has a great FAQ describing how to use `kitty icat` or similar to
output graphviz diagrams as images - really cool stuff!
- [michaeljclark/glkitty](https://github.com/michaeljclark/glkitty) - uses OpenGL to render into kitty

## Issues

This POC only works on Linux and basically requires [kitty](https://sw.kovidgoyal.net/kitty/) to function. Other terminals such as [wezterm](https://wezfurlong.org/wezterm/index.html) and [alacritty](https://alacritty.org/) can display images, but they don't have full SGR-pixel mouse support and/or don't support the full kitty keyboard progressive enhancement protocol.

What this means in practice is: this is not a great foundation to build an application that you intend on distributing. I'd limit this to local one-offs, quick proofs of concept, and visualizations.

### Running Kitty Under WSL 2.0

using [Ubuntu-22.04.2 LTS](https://apps.microsoft.com/store/detail/ubuntu-22042-lts/9PN20MSR04DW?hl=en-us&gl=us&rtc=1) from the Windows app store

I'm on NVidia which requires the Cuda toolkit for some reason!

```bash
sudo apt install libwayland-cursor0 libwayland-egl1 cuda-toolkit-11-0
kitty&
```

kitty is very out of date on `apt` so I'd recommend following the install instructions [here](https://sw.kovidgoyal.net/kitty/binary/)


## Extra

Here are a few more videos showing what you can do with a framebuffer and mouse+keyboard inputs

### Mouse position sets clear color

<div class="video-embed" style="position: relative; padding-top: 60%;">
  <iframe
    src="https://customer-vv39d21derhw1phl.cloudflarestream.com/d666663fc85ab7c5029c291f33eaad83/iframe?poster=https%3A%2F%2Fcustomer-vv39d21derhw1phl.cloudflarestream.com%2Fd666663fc85ab7c5029c291f33eaad83%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600&letterboxColor=transparent&preload=true"
    style="border: none; position: absolute; top: 0; left: 0; height: 100%; width: 100%;"
    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
    allowfullscreen="true"
  ></iframe>
</div>


## Particles
<div class="video-embed" style="position: relative; padding-top: 60%;">
  <iframe
    src="https://customer-vv39d21derhw1phl.cloudflarestream.com/948e79a5a4cf625276e95bd268c15bfb/iframe?poster=https%3A%2F%2Fcustomer-vv39d21derhw1phl.cloudflarestream.com%2F948e79a5a4cf625276e95bd268c15bfb%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600&letterboxColor=transparent&preload=true"
    style="border: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%"
    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
    allowfullscreen="true"
  ></iframe>
</div>

