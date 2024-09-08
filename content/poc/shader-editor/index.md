+++
title = "Shader Editor"
date = 2023-11-10

[extra]
unlisted = true
+++

<section>
  <section id="output-container" style="position:relative; height: 256px; margin-bottom: 2em">
    <canvas id="output"></canvas>
  </section>
  <div id="editor" style="height:512px; width: 100%" ></div>

  <script src="js/monaco-editor/min/vs/loader.js"></script>
  <script type="module" src="js/editor.js"></script>
</section>

## Keywords

#### `PassCreate(passName)`
Add a pass with the _unique_ name `passName`, this creates a renderpass that can be refererenced from other passes.

#### `PassGetSampler(sourcePassName, sourcePassOutput)`
__Note:__ this is only allowed inside a `PassCreate` block

Fetch the output from another pass as a `sampler2D`

#### `PassStore(format, outputName, value)`
__Note:__ this is only allowed inside a `PassCreate` block

Store a value in the specified `outputName` at the thread's current. This is effectively writing to one of the global `out` variables
- formats: `rgba8`, `r32f`, etc..

#### `PassSetSize(width, height)`
__Note:__ this is only allowed inside a `PassCreate` block

Sets the width and height of the pass. If not provided, it will default to the viewport size.

TODO: add support for scaling this relative to the viewport size

## DEVLOG

### Future
- expand `PassGetSampler` to allow configuration (filtering, clamping mode, etc...)
- implement `PassSetInvocations(int)`
- implement `PassSetMipmapBuilder()`
- implement `PassParamF32(rangeStart, rangeEnd, initialValue, scale)`
  Add a pass specific float slider with the given range and initial value
  scales: linear
- add gltf loader/viewer

- consider persisting undo/redo snapshot

### Pending
- handle nested `PassGetSampler` inside `PassStore`
- ignore `Pass*` instructions that live in comments
- add expression solver to allow pass size to be scaled

### 2024-09-08
- implement `PassSetSize(w, h)`
- actually resize render target based on `PassSetSize`
- rename `programs` to `passes`
- persist editor state on reload (e.g., cursor position and viewport)
- make parser bugs not break the entire editing experience (try/catch)
