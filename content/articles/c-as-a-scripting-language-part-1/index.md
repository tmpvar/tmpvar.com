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
 watchexec -c -w $rd "bash ~/bin/c.sh $@"
}
```

### Usage:

```bash
c path/to/file.{c,cpp}
```

<section class="center-align">
<video controls>
  <source src="assets/c.webm" type="video/webm" />
</video>
</section>

```bash
cwatch path/to/file.{c,cpp}
```

<section class="center-align">
<video controls>
<source src="assets/cwatch.mp4" type="video/mp4" />
</video>
</section>


### Issues:

- does not maintain state across reloads
- no persistent state (e.g., if we created a window it would flash + muck with focus)
- requires *nix and an installed compiler
- `#include`ed files are not scanned for `#pragma CFLAGS`
