+++
title = "WASM parser"
date = 2024-10-07
[extra]
+++

{{ ExternalCode(path="parser.cpp", codelang="c++") }}

{{ ExternalCode(path="demo.js", codelang="js") }}

<input type="text" id="string-to-parse" value="(1 + 2) * 3"></input>
<pre id="output"></pre>
<script type="module" src="demo.js"></script>

# Notes

I originally wanted to do this using clang only, but ran into some issues related to the default NixOS `clang-wrapper`. In order to get something working, I tried `emcc` and later found `embind` which removes a bunch of the work.

# Refs
- [embind](https://emscripten.org/docs/porting/connecting_cpp_and_javascript/embind.html#embind)