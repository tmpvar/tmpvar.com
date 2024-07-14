+++
title = "WebAudio - clicks"
date = 2024-07-13
+++

## Why?

At a work focused hackathon, I built a thing that effectively plots timeseries data to aid in observability. I thought it would be cool to run some of this data through a probabilistic model and generate some audio. Like in a background tab this sound can just play and when things go wrong the crescendo of sounds can alert someone that there is a problem.

## Demo

<section id="demo-content">
  <section class="controls">
  </section>
  <section class="center-align">
    <audio></audio>
    <canvas width="1024" height="256"></canvas>
  </section>
  <script src="demo.js" type="module"></script>
</section>

## References

- [webaudioapi.com](https://webaudioapi.com/book/Web_Audio_API_Boris_Smus_html/toc.html)
