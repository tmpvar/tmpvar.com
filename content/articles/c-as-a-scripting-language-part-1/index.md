+++
title = "Using C/C++ as a scripting language (Part 1)"
date = 2020-02-01
+++

In Javascript land, we are pampered with hot code reloading machinery. Not only that, but you can "run" a `.js` file via `node path/to/file.js`. Since I've been preferring C/C++ lately, how can these conveniences be ported to a lower-level language?

<!-- more -->

Typically when starting a C/C++ project there is this annoying step of setting up a build system. Makefiles, CMake, Ninja, Gyp, Gn, Bake, Meson, etc, etc... Many of these do not play well together and encourage you to buy fully into them to manage dependencies and do a bunch of things that are not even remotely needed to solve the problem at hand.

So what is the problem at hand? Lowering the friction between writing a C file, building, and launching it. I want it to feel effortless to create a new c project.

Goals:

- no noticeable compile step (e.g., `c path/to/file.c` immediately executes)
- hot reload
- for trivial scripts, do not require a compiler / libc


## First round: Bash scripts



`~/bin/c.sh`

```bash
#!/usr/bin/bash
CPATH=$(dirname "${BASH_SOURCE[0]}")
SRC=$1
DST=$(mktemp)
EXT="${SRC##*.}"

# Allow the source file to include some C flags that is requires
FOUND_CFLAGS=$(
 grep "#pragma CFLAGS=" $SRC \
 | sed 's/#pragma CFLAGS=//' \
 | paste -s -d " " -
)

CFLAGS="$CFLAGS $FOUND_CFLAGS"
CC=clang++
if [ ${SRC: -2} == ".c" ]; then
  CC=clang
fi

$CC $SRC -O3 -g $CFLAGS -o $DST &&
chmod +x $DST &&
$DST ${@:2} &&
rm $DST
```

in `~/.bashrc`

```bash
# compile and run a .c/cpp file
c() {
 ~/bin/c.sh $@
}

# recompile + relaunch a .c/cpp file
cwatch() {
 rp=$(realpath $1)
 rd=$(dirname $rp)

 # Note: you might want to add --poll 100ms if you are working under WSL
 watchexec --clear=reset --restart --poll 100ms -w $rd "bash ~/bin/c.sh $@"
}
```

### Usage:

```bash
c path/to/file.{c,cpp}
```


<div class="video-embed" style="position: relative; padding-top: 51.4689880304679%;">
  <iframe
    src="https://customer-vv39d21derhw1phl.cloudflarestream.com/a7f5f41531356f2ce9cc992a695f88ae/iframe?poster=https%3A%2F%2Fcustomer-vv39d21derhw1phl.cloudflarestream.com%2Fa7f5f41531356f2ce9cc992a695f88ae%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600&letterboxColor=transparent"
    style="border: none; position: absolute; top: 0; left: 0; height: 100%; width: 100%;"
    allow="accelerometer; gyroscope; autoplay; encrypted-media"
    allowfullscreen="true"
  ></iframe>
</div>

```bash
cwatch path/to/file.{c,cpp}
```

<div class="video-embed" style="position: relative; padding-top: 47.39583333333333%;">
 <iframe
    src="https://customer-vv39d21derhw1phl.cloudflarestream.com/b414674dcd5aa6431b5996dca2e560c1/iframe?preload=true&poster=https%3A%2F%2Fcustomer-vv39d21derhw1phl.cloudflarestream.com%2Fb414674dcd5aa6431b5996dca2e560c1%2Fthumbnails%2Fthumbnail.jpg%3Ftime%3D%26height%3D600&letterboxColor=transparent"
    style="border: none; position: absolute; top: 0; left: 0; height: 100%; width: 100%;"
    allow="accelerometer; gyroscope; autoplay; encrypted-media"
    allowfullscreen="true"
  ></iframe>
</div>

### Issues:

- does not maintain state across reloads
- no persistent state (e.g., if we created a window it would flash + muck with focus)
- requires *nix and an installed compiler
- `#include`ed files are not scanned for `#pragma CFLAGS`
