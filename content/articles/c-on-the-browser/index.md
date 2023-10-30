+++
title = "Running C on the browser with WebAssembly"
date = 2023-10-29

[extra]
unlisted = true
+++

Over the past couple years, all of my hobby programming has been done in C with light usage of C++. To be more precise, I only use C++ features where it would be more painful in C. Things like operator overloading, function overloading, `constexpr`, and very limited template usage where macros would do more harm than good.

Recently, I've been working up proof of concepts and publishing them under the [/poc](/poc) directory. Each of these POCs have multiple demos, which are all built to be self contained to avoid bitrot, written in Javascript. Javscript is a fine language, but sometimes I want the demo to serve a dual purpose:

1. demonstrate some technique / approach / etc..
2. give me a starting point for using some aspect the POC in native code (most likely in C)

<!-- more -->


Unfortunately, when spending the time to write the POC in Javascript is usually only good for the demo and it is not directly portable to C. Meaning, I'd need to implement it again to get it running natively. You could argue that the C version should be optimized for multithreading & SIMD, which is true, but I want some basecode that I can use in both places.

## Goals

### one OS-level allocation

I've become accustomed to pre-allocating a heap and splitting it into regions to be sub-allocated. This means that systems can manage their own memory in the best way that makes sense for them. Reaching for the OS-level `malloc()` is just wasteful in many cases.

Ideally, all of the memory that the C code uses is instantiated on the JS side via an `ArrayBuffer`.

### instantly runnable

Single header libraries that ship with a "self test" really make me happy.

for example:

{{ ExternalCode(path="examples/add.h", codelang="c") }}

This has a few notable benefits:

1. the dependencies can be limited to the scope they are needed in
2. someone can copy/paste this code and run it instantly using an approach similar to [Using C/C++ as a scripting language](/articles/c-as-a-scripting-language-part-1/)
3. when `#includ`ed, simply not defining `Add_TEST` allows this to be used like a library

## Implementation

The first thing you'll find when looking for how to compile C to wasm is emscripten. I remember when emscripten first came out and its target was asm.js. It was really big to download and the output was large and used a ton of memory. Perhaps it has gotten better with time, but I'd like to avoid it if possible.

Thankfully the LLVM project has supported wasm for some time now - let's see how that works instead.

### Building

refs:
 - [depth-first.com](https://depth-first.com/articles/2019/10/16/compiling-c-to-webassembly-and-running-it-without-emscripten/)
 - [surma.dev](https://surma.dev/things/c-to-webassembly/)
 - [https://aransentin.github.io/cwasm/](https://aransentin.github.io/cwasm/)

```bash
clang \
  --target=wasm32 \
  --no-standard-libraries \
  -Wl,--export-all \
  -Wl,--no-entry \
  -o examples/add.wasm \
  -x c++ \
  examples/add.h
```

### Running
In the browser

{{ ExternalCode(path="examples/add.js", codelang="js") }}

<pre><code id="example-add-output"></code></pre>

<script type="module" src="examples/add.js"></script>

or natively

```shell
$ clang -x c++ examples/add.h -DAdd_TEST -o add-test && ./add-test
result: 13
```




