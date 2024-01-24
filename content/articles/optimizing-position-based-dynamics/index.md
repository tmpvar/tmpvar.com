+++
title = "Optimizing Position Based Dynamics"
date = 2024-01-22
[extra]
unlisted = true
+++

The main idea behind [Position Based Dynamics (PBD)](https://matthias-research.github.io/pages/publications/posBasedDyn.pdf) is that positions/orientations
should be directly modified and velocity is computed based on the postional change divided by the delta time. Positions can be constrained explicitly or
collisions can generate automatically create constraints that apply corrections to the referenced positions.

<!-- more -->

When building a large particle simulation, one of the first optimizations one makes is subdiviing space into a grid / spatial hash / etc. This reduces the collision test time complexity from O(n^2) to
hopefully something more managable. When computing collision pairs, instead of comparing every position against every other position, we can limit this search to a cell and its immediate neighbors.


## Approaches



## Further Reading / References

- [https://matthias-research.github.io/pages/tenMinutePhysics/index.html](https://matthias-research.github.io/pages/tenMinutePhysics/index.html)
- [https://johanhelsing.studio/posts/bevy-xpbd](https://johanhelsing.studio/posts/bevy-xpbd)