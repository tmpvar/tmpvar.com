+++
title = "Volumetric Billboards"
date = 2024-02-18
[extra]
unlisted = true
+++

## Inspiration

Alex Evan's [Learning From Failure](https://www.youtube.com/watch?v=u9KNtnCZDMI) talk and [slides](https://web.archive.org/web/20221206083222/http://media.lolrus.mediamolecule.com/AlexEvans_SIGGRAPH-2015.pdf)

[Original Paper](https://hal.inria.fr/inria-00402067)

## How it works

## Demo

<section id="volumetric-billboards-content" class="has-webgpu">
  <section class="controls">
  </section>
  <section class="center-align">
    <canvas width="1024" height="1024"></canvas>
  </section>
  <script src="volumetric-billboards.js" type="module"></script>
  <p>
    source: <a href="volumetric-billboards.js" target="_blank">volumetric-billboards.js</a>
  </p>
</section>

## Downsides

- fill rate
- the original paper talks about some sort of global slicing mechanism

## References

- [https://nehe.gamedev.net/article/billboarding_how_to/18011/](https://nehe.gamedev.net/article/billboarding_how_to/18011/)
