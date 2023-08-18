+++
title = "Rendering Interactive Graphics in Kitty"
date = 2020-04-01
draft = true
+++

Using [kitty](https://sw.kovidgoyal.net/kitty/)'s graphics protocol, one can build very quick visualizations and interactive demos.

<!-- more -->


## TODO
- generate a freestanding kr.h that can be embedded in the post
- capture some better images

### Running Kitty Under WSL 2.0

using [Ubuntu-22.04.2 LTS](https://apps.microsoft.com/store/detail/ubuntu-22042-lts/9PN20MSR04DW?hl=en-us&gl=us&rtc=1) from the Windows app store

I'm on NVidia which requires the Cuda toolkit for some reason!

```bash
sudo apt install libwayland-cursor0 libwayland-egl1 cuda-toolkit-11-0
kitty&
```

Note: kitty is very out of date on `apt` so I'd recommend following the install instructions [here](https://sw.kovidgoyal.net/kitty/binary/)
